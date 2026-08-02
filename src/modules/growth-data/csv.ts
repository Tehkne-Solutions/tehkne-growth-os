import type { MetricObservation } from "./types";

export type CsvMetricRow = {
  metric_id: string;
  period_start: string;
  period_end: string;
  value: string;
  source?: string;
  currency?: string;
};

export function parseMetricCsvRow(
  row: CsvMetricRow,
  workspaceId: string,
  id: string,
): MetricObservation {
  const value = Number(row.value);
  const periodStart = new Date(row.period_start);
  const periodEnd = new Date(row.period_end);

  if (!row.metric_id?.trim()) throw new Error("metric_id is required");
  if (!Number.isFinite(value)) throw new Error("value must be numeric");
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) throw new Error("Invalid metric period");
  if (periodEnd < periodStart) throw new Error("period_end must be greater than or equal to period_start");

  return {
    id,
    workspaceId,
    metricId: row.metric_id.trim(),
    periodStart,
    periodEnd,
    value,
    currency: row.currency?.trim() || undefined,
    source: row.source?.trim() || "csv",
    dimensions: {},
  };
}
