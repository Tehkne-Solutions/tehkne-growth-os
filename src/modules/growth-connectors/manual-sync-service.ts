import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { planPaidMediaSyncWindow, withConnectorRetry, type ConnectorRetryPolicy } from "./operations-policy";
import type { PaidMediaPerformanceReader } from "./paid-media-performance-adapters";
import { syncPaidMediaPerformance, type PaidMediaSyncResult } from "./performance-sync-service";
import type { SecretProvider } from "./secret-provider";
import type { ConnectorConnection, ConnectorProvider } from "./types";

export class ConnectorManualSyncValidationError extends Error {}

export async function runAuthorizedManualConnectorSync(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
    secrets: SecretProvider;
    resolveReader(provider: ConnectorProvider): PaidMediaPerformanceReader;
    retryPolicy?: ConnectorRetryPolicy;
    sleep?: (delayMs: number) => Promise<void>;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    connectionId: string;
    now?: Date;
  }>,
): Promise<Readonly<{ attempts: number; sync: PaidMediaSyncResult }>> {
  const tenant = parseTenantContext(input.tenant);
  if (!tenant.workspaceId || !tenant.clientOrganizationId) {
    throw new ConnectorManualSyncValidationError("Manual connector sync requires an explicit workspace.");
  }

  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: "growth.connectors.manage",
  });

  const rows = await dependencies.database.$queryRaw<Array<{
    id: string;
    workspaceId: string;
    provider: ConnectorProvider;
    externalAccountId: string;
    displayName: string;
    status: "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";
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
    WHERE c.id = ${input.connectionId}::uuid
      AND c.workspace_id = ${tenant.workspaceId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ConnectorManualSyncValidationError("Connector connection was not found in this workspace.");
  if (row.status !== "ACTIVE") throw new ConnectorManualSyncValidationError("Only ACTIVE connector connections can be synchronized.");
  if (!row.secretRef) throw new ConnectorManualSyncValidationError("Connector connection has no token secret reference.");

  const connection: ConnectorConnection = {
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
  };

  const committedPack = await dependencies.database.metricImportBatch.findFirst({
    where: { workspaceId: tenant.workspaceId, status: "COMMITTED" },
    orderBy: { committedAt: "desc" },
    select: { sectorPackId: true, sectorPackVersion: true },
  });
  if (!committedPack) throw new ConnectorManualSyncValidationError("Workspace has no committed Sector Pack.");

  const sectorPack = await loadSectorPackManifest({
    id: committedPack.sectorPackId,
    version: committedPack.sectorPackVersion,
  });
  const now = input.now ?? new Date();
  const window = planPaidMediaSyncWindow({ watermark: connection.checkpoint?.watermark ?? null, now });
  let attempts = 0;
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
  return { attempts, sync };
}
