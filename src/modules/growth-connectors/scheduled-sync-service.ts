import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { DatabaseClient } from "@/shared/db/client";

import type { PaidMediaPerformanceReader } from "./paid-media-performance-adapters";
import { planPaidMediaSyncWindow, withConnectorRetry, type ConnectorRetryPolicy } from "./operations-policy";
import { syncPaidMediaPerformance, type PaidMediaSyncResult } from "./performance-sync-service";
import type { SecretProvider } from "./secret-provider";
import { ensureFreshConnectorToken, type OAuthTokenRefresher } from "./token-refresh";
import type { ConnectorConnection, ConnectorProvider } from "./types";

export type ScheduledConnectorResult = Readonly<{
  connectionId: string;
  workspaceId: string;
  provider: ConnectorProvider;
  ok: boolean;
  attempts: number;
  sync: PaidMediaSyncResult | null;
  error: string | null;
}>;

export async function listDueConnectorConnections(
  database: DatabaseClient,
  now = new Date(),
  dueAfterMinutes = 180,
): Promise<ConnectorConnection[]> {
  const cutoff = new Date(now.getTime() - dueAfterMinutes * 60_000);
  const rows = await database.$queryRaw<Array<{
    id: string;
    workspaceId: string;
    provider: ConnectorProvider;
    externalAccountId: string;
    displayName: string;
    status: "ACTIVE";
    secretRef: string | null;
    cursor: string | null;
    watermark: Date | null;
    lastSuccessAt: Date | null;
    lastAttemptAt: Date | null;
    consecutiveFailures: number | null;
  }>>`
    SELECT
      c.id,
      c.workspace_id AS "workspaceId",
      c.provider,
      c.external_account_id AS "externalAccountId",
      c.display_name AS "displayName",
      c.status,
      c.secret_ref AS "secretRef",
      cp.cursor,
      cp.watermark,
      cp.last_success_at AS "lastSuccessAt",
      cp.last_attempt_at AS "lastAttemptAt",
      cp.consecutive_failures AS "consecutiveFailures"
    FROM growth_connector_connections c
    LEFT JOIN growth_connector_checkpoints cp ON cp.connection_id = c.id
    WHERE c.status = 'ACTIVE'
      AND (cp.last_success_at IS NULL OR cp.last_success_at <= ${cutoff})
    ORDER BY COALESCE(cp.last_success_at, c.created_at) ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    displayName: row.displayName,
    status: row.status,
    secretRef: row.secretRef,
    checkpoint: row.consecutiveFailures === null
      ? null
      : {
          cursor: row.cursor,
          watermark: row.watermark,
          lastSuccessAt: row.lastSuccessAt,
          lastAttemptAt: row.lastAttemptAt,
          consecutiveFailures: row.consecutiveFailures,
        },
  }));
}

export async function runDueConnectorSyncs(dependencies: Readonly<{
  database: DatabaseClient;
  secrets: SecretProvider;
  resolveReader(provider: ConnectorProvider): PaidMediaPerformanceReader;
  resolveRefresher(provider: ConnectorProvider): OAuthTokenRefresher | null;
  resolveSectorPack(workspaceId: string): Promise<SectorPackManifest>;
  retryPolicy?: ConnectorRetryPolicy;
  sleep?: (delayMs: number) => Promise<void>;
}>, input: Readonly<{
  now?: Date;
  dueAfterMinutes?: number;
  limit?: number;
  deadlineAt?: Date;
}> = {}): Promise<ScheduledConnectorResult[]> {
  const now = input.now ?? new Date();
  const due = await listDueConnectorConnections(dependencies.database, now, input.dueAfterMinutes ?? 180);
  const selected = due.slice(0, input.limit ?? 25);
  const results: ScheduledConnectorResult[] = [];

  for (const connection of selected) {
    if (input.deadlineAt && Date.now() >= input.deadlineAt.getTime()) break;
    let attempts = 0;
    try {
      if (!connection.secretRef) throw new Error("Connector connection has no token secret reference.");
      const refresher = dependencies.resolveRefresher(connection.provider);
      if (refresher) {
        await ensureFreshConnectorToken({
          secretRef: connection.secretRef,
          secrets: dependencies.secrets,
          refresher,
          now,
        });
      }
      const sectorPack = await dependencies.resolveSectorPack(connection.workspaceId);
      const window = planPaidMediaSyncWindow({ watermark: connection.checkpoint?.watermark ?? null, now });
      const sync = await withConnectorRetry(
        async (attempt) => {
          attempts = attempt;
          return syncPaidMediaPerformance(
            {
              database: dependencies.database,
              secrets: dependencies.secrets,
              reader: dependencies.resolveReader(connection.provider),
            },
            {
              connection,
              sectorPack,
              startDate: window.startDate,
              endDate: window.endDate,
              now,
            },
          );
        },
        {
          ...(dependencies.retryPolicy ? { policy: dependencies.retryPolicy } : {}),
          ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
        },
      );
      results.push({
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
        provider: connection.provider,
        ok: true,
        attempts,
        sync,
        error: null,
      });
    } catch (error) {
      results.push({
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
        provider: connection.provider,
        ok: false,
        attempts: Math.max(1, attempts),
        sync: null,
        error: error instanceof Error ? error.message : "Unknown connector scheduler error",
      });
    }
  }
  return results;
}
