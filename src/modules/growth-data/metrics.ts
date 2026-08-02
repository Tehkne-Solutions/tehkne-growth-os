import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { MetricObservation } from "./types";

export function assertMetricBelongsToPack(
  pack: SectorPackManifest,
  observation: Pick<MetricObservation, "metricId">,
): void {
  if (!pack.metrics.some((metric) => metric.id === observation.metricId)) {
    throw new Error(`Metric ${observation.metricId} is not declared by sector pack ${pack.id}`);
  }
}

export function aggregateMetric(observations: MetricObservation[]): number {
  return observations.reduce((total, observation) => total + observation.value, 0);
}
