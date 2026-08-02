import type { CommandCenterIntelligence } from "@/modules/command-center/intelligence";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

import { evaluateMetricGoal, type MetricGoal, type MetricGoalEvaluation } from "./goals";
import { interpretMetricMovement, type MetricOutcome } from "./semantics";

export type InterpretedCommandCenterMetric = CommandCenterIntelligence["metrics"][number] & {
  direction: "up" | "down" | "contextual" | null;
  outcome: MetricOutcome | "unknown-metric";
  goal: MetricGoalEvaluation | null;
};

export type InterpretedCommandCenterIntelligence = CommandCenterIntelligence & {
  sectorPack: { id: string; version: string } | null;
  interpretedMetrics: InterpretedCommandCenterMetric[];
};

export function enrichCommandCenterIntelligence(input: {
  intelligence: CommandCenterIntelligence;
  sectorPack: SectorPackManifest | null;
  goals: readonly MetricGoal[];
}): InterpretedCommandCenterIntelligence {
  const metricDefinitions = new Map(
    input.sectorPack?.metrics.map((metric) => [metric.id, metric]) ?? [],
  );
  const goals = new Map(input.goals.map((goal) => [metricKey(goal), goal]));

  return {
    ...input.intelligence,
    sectorPack: input.sectorPack
      ? { id: input.sectorPack.id, version: input.sectorPack.version }
      : null,
    interpretedMetrics: input.intelligence.metrics.map((metric) => {
      const definition = metricDefinitions.get(metric.metricId);
      if (!definition) {
        return {
          ...metric,
          direction: null,
          outcome: "unknown-metric" as const,
          goal: null,
        };
      }

      const semantic = interpretMetricMovement({
        currentValue: metric.currentValue,
        previousValue: metric.previousValue,
        direction: definition.direction,
      });
      const goal = goals.get(metricKey(metric));

      return {
        ...metric,
        direction: definition.direction,
        outcome: semantic.outcome,
        goal: goal
          ? evaluateMetricGoal({
              currentValue: metric.currentValue,
              targetValue: goal.targetValue,
              direction: definition.direction,
            })
          : null,
      };
    }),
  };
}

function metricKey(metric: { metricId: string; currency: string | null }): string {
  return `${metric.metricId}:${metric.currency ?? "none"}`;
}
