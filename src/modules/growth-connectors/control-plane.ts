import { randomUUID } from "node:crypto";

import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { DatabaseClient } from "@/shared/db/client";

import type { PaidMediaPerformanceReader } from "./paid-media-performance-adapters";
import { runDueConnectorSyncs, type ScheduledConnectorResult } from "./scheduled-sync-service";
import type { SecretProvider } from "./secret-provider";
import type { OAuthTokenRefresher } from "./token-refresh";
import type { ConnectorProvider } from "./types";

export type SchedulerTriggerSource = "VERCEL_CRON" | "GITHUB_ACTIONS" | "MANUAL_INTERNAL";

export type ConnectorControlPlaneAlert = Readonly<{
  connectionId: string;
  workspaceId: string;
  provider: ConnectorProvider;
  displayName: string;
  reason: "never_synchronized" | "repeated_failures" | "stale_data" | "connection_error";
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
}>;

export type ConnectorControlPlaneResult = Readonly<{
  runId: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED_LOCKED" | "BUDGET_EXHAUSTED";
  results: readonly ScheduledConnectorResult[];
  alerts: readonly ConnectorControlPlaneAlert[];
  budgetMs: number;
}>;

const LOCK_KEY = "paid-media-connectors";

export async function runConnectorControlPlane(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    resolveReader(provider: ConnectorProvider): PaidMediaPerformanceReader;
    resolveRefresher(provider: ConnectorProvider): OAuthTokenRefresher | null;
    resolveSectorPack(workspaceId: string): Promise<SectorPackManifest>;
  }>,
  input: Readonly<{
    triggerSource: SchedulerTriggerSource;
    budgetMs?: number;
    dueAfterMinutes?: number;
    limit?: number;
    leaseMs?: number;
    now?: Date;
  }>,
): Promise<ConnectorControlPlaneResult> {
  const startedAt = input.now ?? new Date();
  const budgetMs = clamp(input.budgetMs ?? 45_000, 5_000, 55_000);
  const leaseMs = Math.max(input.leaseMs ?? 70_000, budgetMs + 10_000);
  const runId = randomUUID();
  const ownerToken = randomUUID();
  const expiresAt = new Date(startedAt.getTime() + leaseMs);

  await dependencies.database.$executeRaw`
    INSERT INTO growth_connector_scheduler_runs
      (id, trigger_source, status, started_at, budget_ms)
    VALUES
      (${runId}::uuid, ${input.triggerSource}, 'RUNNING', ${startedAt}, ${budgetMs})
  `;

  const acquired = await dependencies.database.$queryRaw<Array<{ ownerToken: string }>>`
    INSERT INTO growth_connector_scheduler_locks
      (lock_key, owner_token, acquired_at, expires_at)
    VALUES
      (${LOCK_KEY}, ${ownerToken}, ${startedAt}, ${expiresAt})
    ON CONFLICT (lock_key) DO UPDATE SET
      owner_token = EXCLUDED.owner_token,
      acquired_at = EXCLUDED.acquired_at,
      expires_at = EXCLUDED.expires_at
    WHERE growth_connector_scheduler_locks.expires_at <= ${startedAt}
    RETURNING owner_token AS "ownerToken"
  `;

  if (acquired[0]?.ownerToken !== ownerToken) {
    await finishRun(dependencies.database, runId, "SKIPPED_LOCKED", [], 0, {
      reason: "scheduler_lock_held",
    });
    return { runId, status: "SKIPPED_LOCKED", results: [], alerts: [], budgetMs };
  }

  let results: ScheduledConnectorResult[] = [];
  try {
    const deadlineAt = new Date(startedAt.getTime() + budgetMs);
    results = await runDueConnectorSyncs(dependencies, {
      now: startedAt,
      dueAfterMinutes: input.dueAfterMinutes ?? 180,
      limit: input.limit ?? 25,
      deadlineAt,
    });
    const alerts = await listControlPlaneAlerts(dependencies.database, startedAt);
    const elapsedMs = Date.now() - startedAt.getTime();
    const failed = results.filter((result) => !result.ok).length;
    const status = elapsedMs >= budgetMs
      ? "BUDGET_EXHAUSTED"
      : failed === 0
        ? "SUCCEEDED"
        : failed === results.length
          ? "FAILED"
          : "PARTIAL";

    await finishRun(dependencies.database, runId, status, results, alerts.length, {
      elapsedMs,
      deadlineAt: deadlineAt.toISOString(),
    });
    return { runId, status, results, alerts, budgetMs };
  } catch (error) {
    await finishRun(dependencies.database, runId, "FAILED", results, 0, {
      error: error instanceof Error ? error.message : "unknown_control_plane_error",
    });
    throw error;
  } finally {
    await dependencies.database.$executeRaw`
      DELETE FROM growth_connector_scheduler_locks
      WHERE lock_key = ${LOCK_KEY} AND owner_token = ${ownerToken}
    `;
  }
}

export async function listControlPlaneAlerts(
  database: DatabaseClient,
  now = new Date(),
): Promise<ConnectorControlPlaneAlert[]> {
  const staleCutoff = new Date(now.getTime() - 720 * 60_000);
  return database.$queryRaw<ConnectorControlPlaneAlert[]>`
    SELECT
      c.id AS "connectionId",
      c.workspace_id AS "workspaceId",
      c.provider,
      c.display_name AS "displayName",
      CASE
        WHEN c.status = 'ERROR' THEN 'connection_error'
        WHEN cp.last_success_at IS NULL THEN 'never_synchronized'
        WHEN COALESCE(cp.consecutive_failures, 0) >= 3 THEN 'repeated_failures'
        ELSE 'stale_data'
      END AS reason,
      COALESCE(cp.consecutive_failures, 0) AS "consecutiveFailures",
      cp.last_success_at AS "lastSuccessAt"
    FROM growth_connector_connections c
    LEFT JOIN growth_connector_checkpoints cp ON cp.connection_id = c.id
    WHERE c.status IN ('ACTIVE', 'ERROR')
      AND (
        c.status = 'ERROR'
        OR cp.last_success_at IS NULL
        OR COALESCE(cp.consecutive_failures, 0) >= 3
        OR cp.last_success_at <= ${staleCutoff}
      )
    ORDER BY COALESCE(cp.consecutive_failures, 0) DESC, cp.last_success_at ASC NULLS FIRST
    LIMIT 100
  `;
}

async function finishRun(
  database: DatabaseClient,
  runId: string,
  status: ConnectorControlPlaneResult["status"],
  results: readonly ScheduledConnectorResult[],
  alertCount: number,
  metadata: Readonly<Record<string, string | number>>,
): Promise<void> {
  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  await database.$executeRaw`
    UPDATE growth_connector_scheduler_runs SET
      status = ${status},
      finished_at = NOW(),
      connections_selected = ${results.length},
      connections_succeeded = ${succeeded},
      connections_failed = ${failed},
      alert_count = ${alertCount},
      metadata = ${JSON.stringify(metadata)}::jsonb
    WHERE id = ${runId}::uuid
  `;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}
