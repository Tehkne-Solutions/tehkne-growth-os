import type { DatabaseClient } from "@/shared/db/client";

import { listConnectorHealthSnapshots, type ConnectorHealthSnapshot } from "./repository";

export type ConnectorRunDiagnostic = Readonly<{
  runId: string;
  connectionId: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";
  recordsRead: number;
  recordsWritten: number;
  recordsDeduplicated: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}>;

export type ConnectorOperationsDiagnostics = Readonly<{
  workspaceId: string;
  health: readonly ConnectorHealthSnapshot[];
  recentRuns: readonly ConnectorRunDiagnostic[];
}>;

export async function loadConnectorOperationsDiagnostics(
  database: DatabaseClient,
  workspaceId: string,
  options: Readonly<{ now?: Date; recentRunLimit?: number }> = {},
): Promise<ConnectorOperationsDiagnostics> {
  const now = options.now ?? new Date();
  const recentRunLimit = Math.min(Math.max(options.recentRunLimit ?? 20, 1), 100);
  const [health, recentRuns] = await Promise.all([
    listConnectorHealthSnapshots(database, workspaceId, now),
    database.$queryRaw<ConnectorRunDiagnostic[]>`
      SELECT
        id AS "runId",
        connection_id AS "connectionId",
        status,
        records_read AS "recordsRead",
        records_written AS "recordsWritten",
        records_deduplicated AS "recordsDeduplicated",
        error_code AS "errorCode",
        error_message AS "errorMessage",
        started_at AS "startedAt",
        finished_at AS "finishedAt"
      FROM growth_connector_sync_runs
      WHERE workspace_id = ${workspaceId}::uuid
      ORDER BY started_at DESC
      LIMIT ${recentRunLimit}
    `,
  ]);
  return { workspaceId, health, recentRuns };
}
