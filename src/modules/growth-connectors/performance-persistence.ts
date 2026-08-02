import type { DatabaseClient } from "@/shared/db/client";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

import {
  expandCampaignPerformanceToMetricObservations,
  type CanonicalCampaignPerformance,
  type CanonicalMetricObservationInput,
} from "./performance-normalization";

export type PersistProviderPerformanceResult = Readonly<{
  produced: number;
  accepted: number;
  written: number;
  deduplicated: number;
  skippedMetricIds: readonly string[];
}>;

export async function persistProviderCampaignPerformance(
  database: DatabaseClient,
  input: Readonly<{
    workspaceId: string;
    sectorPack: SectorPackManifest;
    records: readonly CanonicalCampaignPerformance[];
  }>,
): Promise<PersistProviderPerformanceResult> {
  const declaredMetricIds = new Set(input.sectorPack.metrics.map((metric) => metric.id));
  const produced = input.records.flatMap((record) => expandCampaignPerformanceToMetricObservations(input.workspaceId, record));
  const accepted = produced.filter((observation) => declaredMetricIds.has(observation.metricId));
  const skippedMetricIds = [...new Set(
    produced.filter((observation) => !declaredMetricIds.has(observation.metricId)).map((observation) => observation.metricId),
  )].sort();

  let written = 0;
  for (const observation of accepted) {
    written += await insertObservation(database, observation);
  }

  return {
    produced: produced.length,
    accepted: accepted.length,
    written,
    deduplicated: accepted.length - written,
    skippedMetricIds,
  };
}

async function insertObservation(database: DatabaseClient, observation: CanonicalMetricObservationInput): Promise<number> {
  const dimensions = JSON.stringify(observation.dimensions);
  return database.$executeRaw`
    INSERT INTO metric_observations (
      id, workspace_id, metric_id, period_start, period_end, value,
      currency, source, source_key, dimensions, created_at
    ) VALUES (
      gen_random_uuid(), ${observation.workspaceId}::uuid, ${observation.metricId},
      ${observation.periodStart}, ${observation.periodEnd}, ${observation.value},
      ${observation.currency ?? null}, ${observation.source}, ${observation.sourceKey},
      ${dimensions}::jsonb, CURRENT_TIMESTAMP
    )
    ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
  `;
}
