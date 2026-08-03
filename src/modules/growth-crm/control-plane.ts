import { randomUUID } from "node:crypto";

import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { SecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { DatabaseClient } from "@/shared/db/client";

import { runDueCrmSyncs, type CrmTokenRefresher, type ScheduledCrmResult } from "./scheduled-sync-service";
import type { CrmProvider, ReadOnlyCrmAdapter } from "./types";

const CRM_LOCK_KEY = "crm-connectors";

export type CrmControlPlaneResult = Readonly<{
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED_LOCKED" | "BUDGET_EXHAUSTED";
  results: readonly ScheduledCrmResult[];
  budgetMs: number;
}>;

export async function runCrmControlPlane(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    resolveAdapter(provider: CrmProvider): ReadOnlyCrmAdapter;
    resolveRefresher(provider: CrmProvider): CrmTokenRefresher | null;
    resolveSectorPack(workspaceId: string): Promise<SectorPackManifest>;
    resolveQualifiedStages?(workspaceId: string, sectorPack: SectorPackManifest): Promise<ReadonlySet<string>>;
    resolveCurrency?(workspaceId: string): Promise<string>;
    fetchImpl?: typeof fetch;
  }>,
  input: Readonly<{
    budgetMs?: number;
    dueAfterMinutes?: number;
    limit?: number;
    leaseMs?: number;
    now?: Date;
  }> = {},
): Promise<CrmControlPlaneResult> {
  const startedAt = input.now ?? new Date();
  const budgetMs = Math.min(Math.max(Math.trunc(input.budgetMs ?? 15_000), 5_000), 20_000);
  const leaseMs = Math.max(input.leaseMs ?? 30_000, budgetMs + 5_000);
  const ownerToken = randomUUID();
  const expiresAt = new Date(startedAt.getTime() + leaseMs);
  const acquired = await dependencies.database.$queryRaw<Array<{ ownerToken: string }>>`
    INSERT INTO growth_connector_scheduler_locks
      (lock_key, owner_token, acquired_at, expires_at)
    VALUES
      (${CRM_LOCK_KEY}, ${ownerToken}, ${startedAt}, ${expiresAt})
    ON CONFLICT (lock_key) DO UPDATE SET
      owner_token = EXCLUDED.owner_token,
      acquired_at = EXCLUDED.acquired_at,
      expires_at = EXCLUDED.expires_at
    WHERE growth_connector_scheduler_locks.expires_at <= ${startedAt}
    RETURNING owner_token AS "ownerToken"
  `;
  if (acquired[0]?.ownerToken !== ownerToken) {
    return { status: "SKIPPED_LOCKED", results: [], budgetMs };
  }

  try {
    const deadlineAt = new Date(startedAt.getTime() + budgetMs);
    const results = await runDueCrmSyncs(dependencies, {
      now: startedAt,
      dueAfterMinutes: input.dueAfterMinutes ?? 180,
      limit: input.limit ?? 10,
      deadlineAt,
    });
    const failed = results.filter((result) => !result.ok).length;
    const elapsedMs = Date.now() - startedAt.getTime();
    const status: CrmControlPlaneResult["status"] = elapsedMs >= budgetMs
      ? "BUDGET_EXHAUSTED"
      : failed === 0
        ? "SUCCEEDED"
        : failed === results.length
          ? "FAILED"
          : "PARTIAL";
    return { status, results, budgetMs };
  } finally {
    await dependencies.database.$executeRaw`
      DELETE FROM growth_connector_scheduler_locks
      WHERE lock_key = ${CRM_LOCK_KEY} AND owner_token = ${ownerToken}
    `;
  }
}
