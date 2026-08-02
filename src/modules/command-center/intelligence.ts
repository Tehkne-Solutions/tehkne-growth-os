import type { CommandCenterMetric, CommandCenterSnapshot } from "./query";

export type MetricTrend = "up" | "down" | "flat" | "no-baseline";

export type CommandCenterMetricComparison = {
  metricId: string;
  currency: string | null;
  currentValue: number;
  previousValue: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  trend: MetricTrend;
};

export type CommandCenterIntelligence = {
  workspaceId: string;
  current: CommandCenterSnapshot;
  previous: CommandCenterSnapshot;
  metrics: CommandCenterMetricComparison[];
  eventCount: {
    current: number;
    previous: number;
    absoluteDelta: number;
    percentageDelta: number | null;
    trend: MetricTrend;
  };
};

export function previousEquivalentPeriod(input: Readonly<{ from: Date; to: Date }>): {
  from: Date;
  to: Date;
} {
  if (input.to < input.from) throw new Error("Invalid command center period");

  const duration = input.to.getTime() - input.from.getTime();
  const previousTo = new Date(input.from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - duration);

  return { from: previousFrom, to: previousTo };
}

export function compareCommandCenterSnapshots(
  current: CommandCenterSnapshot,
  previous: CommandCenterSnapshot,
): CommandCenterIntelligence {
  if (current.workspaceId !== previous.workspaceId) {
    throw new Error("Command Center comparison cannot mix workspaces");
  }

  const currentMetrics = indexMetrics(current.metrics);
  const previousMetrics = indexMetrics(previous.metrics);
  const keys = [...new Set([...currentMetrics.keys(), ...previousMetrics.keys()])].sort();

  return {
    workspaceId: current.workspaceId,
    current,
    previous,
    metrics: keys.map((key) => {
      const currentMetric = currentMetrics.get(key);
      const previousMetric = previousMetrics.get(key);
      const currentValue = currentMetric?.value ?? 0;
      const previousValue = previousMetric?.value ?? 0;
      const change = compareValues(currentValue, previousValue);

      return {
        metricId: currentMetric?.metricId ?? previousMetric!.metricId,
        currency: currentMetric?.currency ?? previousMetric?.currency ?? null,
        currentValue,
        previousValue,
        ...change,
      };
    }),
    eventCount: {
      current: current.eventCount,
      previous: previous.eventCount,
      ...compareValues(current.eventCount, previous.eventCount),
    },
  };
}

function indexMetrics(metrics: readonly CommandCenterMetric[]) {
  return new Map(metrics.map((metric) => [metricKey(metric), metric]));
}

function metricKey(metric: Pick<CommandCenterMetric, "metricId" | "currency">): string {
  return `${metric.metricId}:${metric.currency ?? "none"}`;
}

function compareValues(current: number, previous: number): {
  absoluteDelta: number;
  percentageDelta: number | null;
  trend: MetricTrend;
} {
  const absoluteDelta = current - previous;

  if (previous === 0) {
    return {
      absoluteDelta,
      percentageDelta: current === 0 ? 0 : null,
      trend: current === 0 ? "flat" : "no-baseline",
    };
  }

  return {
    absoluteDelta,
    percentageDelta: (absoluteDelta / Math.abs(previous)) * 100,
    trend: absoluteDelta > 0 ? "up" : absoluteDelta < 0 ? "down" : "flat",
  };
}
