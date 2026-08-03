import type { InterpretedCommandCenterMetric } from "./enrich-command-center";

export type FullFunnelMetricId =
  | "leads"
  | "qualified_leads"
  | "opportunities"
  | "won_deals"
  | "revenue"
  | "cpl"
  | "cpa"
  | "roas";

export type FullFunnelSummary = Readonly<{
  metrics: ReadonlyArray<Readonly<{
    metricId: FullFunnelMetricId;
    currentValue: number;
    previousValue: number;
    percentageDelta: number | null;
    currency: string | null;
  }>>;
  availableMetricIds: readonly FullFunnelMetricId[];
}>;

const fullFunnelMetricIds = new Set<FullFunnelMetricId>([
  "leads",
  "qualified_leads",
  "opportunities",
  "won_deals",
  "revenue",
  "cpl",
  "cpa",
  "roas",
]);

export function deriveFullFunnelSummary(metrics: readonly InterpretedCommandCenterMetric[]): FullFunnelSummary {
  const selected = metrics.flatMap((metric) => {
    if (!fullFunnelMetricIds.has(metric.metricId as FullFunnelMetricId)) return [];
    return [{
      metricId: metric.metricId as FullFunnelMetricId,
      currentValue: metric.currentValue,
      previousValue: metric.previousValue,
      percentageDelta: metric.percentageDelta,
      currency: metric.currency,
    }];
  });
  return {
    metrics: selected,
    availableMetricIds: [...new Set(selected.map((metric) => metric.metricId))],
  };
}
