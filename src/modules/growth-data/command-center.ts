import type { MetricObservation } from "./types";

export type CommandCenterMetric = {
  metricId: string;
  value: number;
  observations: number;
};

export type CommandCenterSnapshot = {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  metrics: CommandCenterMetric[];
};

export function buildCommandCenterSnapshot(input: {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  observations: MetricObservation[];
}): CommandCenterSnapshot {
  if (input.periodEnd < input.periodStart) {
    throw new Error("periodEnd must be greater than or equal to periodStart");
  }

  const aggregates = new Map<string, CommandCenterMetric>();

  for (const observation of input.observations) {
    if (observation.workspaceId !== input.workspaceId) {
      throw new Error("Cross-workspace observation detected");
    }
    if (observation.periodEnd < input.periodStart || observation.periodStart > input.periodEnd) {
      continue;
    }

    const current = aggregates.get(observation.metricId) ?? {
      metricId: observation.metricId,
      value: 0,
      observations: 0,
    };

    current.value += observation.value;
    current.observations += 1;
    aggregates.set(observation.metricId, current);
  }

  return {
    workspaceId: input.workspaceId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    metrics: [...aggregates.values()].sort((a, b) => a.metricId.localeCompare(b.metricId)),
  };
}
