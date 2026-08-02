import type { DatabaseClient } from "@/shared/db/client";

import { evaluateConnectorHealth, type ConnectorHealth } from "./freshness";
import type { ConnectorConnection, ConnectorConnectionStatus, ConnectorProvider } from "./types";

export type ConnectorHealthSnapshot = Readonly<{
  connection: ConnectorConnection;
  health: ConnectorHealth;
}>;

export async function listConnectorHealthSnapshots(
  database: DatabaseClient,
  workspaceId: string,
  now = new Date(),
): Promise<ConnectorHealthSnapshot[]> {
  const rows = await database.$queryRaw<Array<{
    id: string;
    workspaceId: string;
    provider: ConnectorProvider;
    externalAccountId: string;
    displayName: string;
    status: ConnectorConnectionStatus;
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
    WHERE c.workspace_id = ${workspaceId}::uuid
    ORDER BY c.provider, c.display_name
  `;

  return rows.map((row) => {
    const checkpoint = row.consecutiveFailures === null
      ? null
      : {
          cursor: row.cursor,
          watermark: row.watermark,
          lastSuccessAt: row.lastSuccessAt,
          lastAttemptAt: row.lastAttemptAt,
          consecutiveFailures: row.consecutiveFailures,
        };
    const connection: ConnectorConnection = {
      id: row.id,
      workspaceId: row.workspaceId,
      provider: row.provider,
      externalAccountId: row.externalAccountId,
      displayName: row.displayName,
      status: row.status,
      secretRef: row.secretRef,
      checkpoint,
    };
    return {
      connection,
      health: evaluateConnectorHealth({ status: connection.status, checkpoint, now }),
    };
  });
}
