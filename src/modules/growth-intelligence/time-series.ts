import type { CommandCenterSnapshot } from "@/modules/command-center/query";
import type { MetricDirection } from "@/modules/sector-packs/types";

export type TimeSeriesPoint = {
  from: Date;
  to: Date;
  value: number;
};

export type NumericTrend = "rising" | "falling" | "flat" | "mixed" | "insufficient-data";
export type MomentumState =
  | "accelerating"
  | "decelerating"
  | "steady"
  | "reversal"
  | "insufficient-data";
export type PerformanceMomentum =
  | "improving"
  | "worsening"
  | "stable"
  | "context-required"
  | "insufficient-data";

export type MetricTimeSeries = {
  metricId: string;
  currency: string | null;
  points: TimeSeriesPoint[];
  trend: NumericTrend;
  momentum: MomentumState;
  performanceMomentum: PerformanceMomentum;
};

export function buildOlderEquivalentPeriods(
  input: Readonly<{ from: Date; to: Date; count: number }>,
): Array<{ from: Date; to: Date }> {
  if (input.to < input.from) throw new Error("Invalid time series period");
  if (!Number.isInteger(input.count) || input.count < 0) throw new Error("Invalid time series count");

  const duration = input.to.getTime() - input.from.getTime();
  const periods: Array<{ from: Date; to: Date }> = [];
  let cursorTo = new Date(input.from.getTime() - 1);

  for (let index = 0; index < input.count; index += 1) {
    const from = new Date(cursorTo.getTime() - duration);
    periods.push({ from, to: cursorTo });
    cursorTo = new Date(from.getTime() - 1);
  }

  return periods.reverse();
}

export function deriveMetricTimeSeries(input: {
  snapshots: readonly CommandCenterSnapshot[];
  directions: ReadonlyMap<string, MetricDirection>;
}): MetricTimeSeries[] {
  const keys = new Set<string>();
  for (const snapshot of input.snapshots) {
    for (const metric of snapshot.metrics) keys.add(metricKey(metric.metricId, metric.currency));
  }

  return [...keys]
    .sort()
    .map((key) => {
      const [metricId, currencyToken] = splitMetricKey(key);
      const points = input.snapshots.map((snapshot) => ({
        from: snapshot.from,
        to: snapshot.to,
        value: snapshot.metrics.find((metric) => metricKey(metric.metricId, metric.currency) === key)?.value ?? 0,
      }));
      const trend = classifyTrend(points);
      const momentum = classifyMomentum(points);
      const direction = input.directions.get(metricId);

      return {
        metricId,
        currency: currencyToken === "none" ? null : currencyToken,
        points,
        trend,
        momentum,
        performanceMomentum: classifyPerformanceMomentum(points, direction),
      };
    });
}

function classifyTrend(points: readonly TimeSeriesPoint[]): NumericTrend {
  if (points.length < 2) return "insufficient-data";
  const deltas = pairwiseDeltas(points);
  const nonZero = deltas.filter((delta) => delta !== 0);
  if (nonZero.length === 0) return "flat";
  if (nonZero.every((delta) => delta > 0)) return "rising";
  if (nonZero.every((delta) => delta < 0)) return "falling";
  return "mixed";
}

function classifyMomentum(points: readonly TimeSeriesPoint[]): MomentumState {
  if (points.length < 3) return "insufficient-data";
  const deltas = pairwiseDeltas(points);
  const latest = deltas.at(-1)!;
  const prior = deltas.at(-2)!;

  if (latest === 0 && prior === 0) return "steady";
  if (latest === 0) return "decelerating";
  if (prior === 0) return "accelerating";
  if (Math.sign(latest) !== Math.sign(prior)) return "reversal";

  const latestMagnitude = Math.abs(latest);
  const priorMagnitude = Math.abs(prior);
  if (latestMagnitude > priorMagnitude) return "accelerating";
  if (latestMagnitude < priorMagnitude) return "decelerating";
  return "steady";
}

function classifyPerformanceMomentum(
  points: readonly TimeSeriesPoint[],
  direction: MetricDirection | undefined,
): PerformanceMomentum {
  if (!direction || points.length < 2) return "insufficient-data";
  if (direction === "contextual") return "context-required";

  const latestDelta = points.at(-1)!.value - points.at(-2)!.value;
  if (latestDelta === 0) return "stable";

  const improved = direction === "up" ? latestDelta > 0 : latestDelta < 0;
  return improved ? "improving" : "worsening";
}

function pairwiseDeltas(points: readonly TimeSeriesPoint[]): number[] {
  const deltas: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    deltas.push(points[index]!.value - points[index - 1]!.value);
  }
  return deltas;
}

function metricKey(metricId: string, currency: string | null): string {
  return `${metricId}:${currency ?? "none"}`;
}

function splitMetricKey(key: string): [string, string] {
  const separator = key.lastIndexOf(":");
  return [key.slice(0, separator), key.slice(separator + 1)];
}
