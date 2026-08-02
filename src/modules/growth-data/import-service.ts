import { assertMetricBelongsToPack } from "./metrics";
import { previewMetricCsv, type CsvImportPreview } from "./csv-file";
import { metricImportFingerprint } from "./import-idempotency";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

export type MetricImportPlan = CsvImportPreview & {
  fingerprint: string;
  workspaceId: string;
  sectorPackId: string;
  sectorPackVersion: string;
};

export function planMetricCsvImport(input: {
  content: string;
  workspaceId: string;
  sectorPack: SectorPackManifest;
  idFactory: (row: number) => string;
}): MetricImportPlan {
  const preview = previewMetricCsv(input.content, input.workspaceId, input.idFactory);
  const accepted = [];
  const rejected = [...preview.rejected];

  for (const observation of preview.accepted) {
    try {
      assertMetricBelongsToPack(input.sectorPack, observation);
      accepted.push(observation);
    } catch (error) {
      rejected.push({
        row: Number(observation.id.match(/\d+$/)?.[0] ?? 0),
        reason: error instanceof Error ? error.message : "Metric is not allowed by sector pack",
        raw: observation.metricId,
      });
    }
  }

  return {
    fingerprint: metricImportFingerprint({
      workspaceId: input.workspaceId,
      sectorPackId: input.sectorPack.id,
      sectorPackVersion: input.sectorPack.version,
      content: input.content,
    }),
    workspaceId: input.workspaceId,
    sectorPackId: input.sectorPack.id,
    sectorPackVersion: input.sectorPack.version,
    accepted,
    rejected,
  };
}
