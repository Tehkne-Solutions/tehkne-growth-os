import { randomUUID } from "node:crypto";

import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { DatabaseClient } from "@/shared/db/client";

import type { PaidMediaPerformanceReader } from "./paid-media-performance-adapters";
import { persistProviderCampaignPerformance } from "./performance-persistence";
import type { SecretProvider } from "./secret-provider";
import type { ConnectorConnection } from "./types";

export type PaidMediaSyncResult = Readonly<{
  runId: string;
  recordsRead: number;
  observationsWritten: number;
  observationsDeduplicated: number;
  skippedMetricIds: readonly string[];
  watermark: Date;
}>;

export async function syncPaidMediaPerformance(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    reader: PaidMediaPerformanceReader;
  }>,
  input: Readonly<{
    connection: ConnectorConnection;
    sectorPack: SectorPackManifest;
    startDate: string;
    endDate: string;
    now?: Date;
  }>,
): Promise<PaidMediaSyncResult> {
  if (input.connection.status !== "ACTIVE") throw new Error("Connector connection must be ACTIVE before syncing.");
  if (!input.connection.secretRef) throw new Error("Connector connection has no token secret reference.");
  const runId = randomUUID();
  const now = input.now ?? new Date();
  const watermark = endOfUtcDay(input.endDate);

  await dependencies.database.$executeRaw`
    INSERT INTO growth_connector_sync_runs (
      id, connection_id, workspace_id, provider, status,
      cursor_before, watermark_before, started_at
    ) VALUES (
      ${runId}::uuid, ${input.connection.id}::uuid, ${input.connection.workspaceId}::uuid,
      ${input.connection.provider}, 'RUNNING', ${input.connection.checkpoint?.cursor ?? null},
      ${input.connection.checkpoint?.watermark ?? null}, ${now}
    )
  `;

  try {
    const records = await dependencies.reader.readCampaignDailyPerformance({
      externalAccountId: input.connection.externalAccountId,
      tokenSecretRef: input.connection.secretRef,
      secrets: dependencies.secrets,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const persisted = await persistProviderCampaignPerformance(dependencies.database, {
      workspaceId: input.connection.workspaceId,
      sectorPack: input.sectorPack,
      records,
    });

    await dependencies.database.$executeRaw`
      INSERT INTO growth_connector_checkpoints (
        connection_id, cursor, watermark, last_success_at, last_attempt_at,
        consecutive_failures, updated_at
      ) VALUES (
        ${input.connection.id}::uuid, NULL, ${watermark}, ${now}, ${now}, 0, ${now}
      )
      ON CONFLICT (connection_id) DO UPDATE SET
        watermark = EXCLUDED.watermark,
        last_success_at = EXCLUDED.last_success_at,
        last_attempt_at = EXCLUDED.last_attempt_at,
        consecutive_failures = 0,
        updated_at = EXCLUDED.updated_at
    `;
    await dependencies.database.$executeRaw`
      UPDATE growth_connector_sync_runs
      SET status = 'SUCCEEDED', watermark_after = ${watermark},
        records_read = ${records.length}, records_written = ${persisted.written},
        records_deduplicated = ${persisted.deduplicated}, finished_at = ${now}
      WHERE id = ${runId}::uuid
        AND workspace_id = ${input.connection.workspaceId}::uuid
    `;

    return {
      runId,
      recordsRead: records.length,
      observationsWritten: persisted.written,
      observationsDeduplicated: persisted.deduplicated,
      skippedMetricIds: persisted.skippedMetricIds,
      watermark,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown connector sync error";
    await dependencies.database.$executeRaw`
      INSERT INTO growth_connector_checkpoints (
        connection_id, cursor, watermark, last_attempt_at, consecutive_failures, updated_at
      ) VALUES (
        ${input.connection.id}::uuid, NULL, ${input.connection.checkpoint?.watermark ?? null}, ${now}, 1, ${now}
      )
      ON CONFLICT (connection_id) DO UPDATE SET
        last_attempt_at = EXCLUDED.last_attempt_at,
        consecutive_failures = growth_connector_checkpoints.consecutive_failures + 1,
        updated_at = EXCLUDED.updated_at
    `;
    await dependencies.database.$executeRaw`
      UPDATE growth_connector_sync_runs
      SET status = 'FAILED', error_code = 'PROVIDER_SYNC_FAILED',
        error_message = ${message}, finished_at = ${now}
      WHERE id = ${runId}::uuid
        AND workspace_id = ${input.connection.workspaceId}::uuid
    `;
    throw error;
  }
}

function endOfUtcDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid provider date: ${value}`);
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid provider date: ${value}`);
  return date;
}
