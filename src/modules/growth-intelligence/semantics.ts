import type { MetricDirection } from "@/modules/sector-packs/types";

export type MetricMovement = "up" | "down" | "flat" | "no-baseline";
export type MetricOutcome = "improved" | "worsened" | "neutral" | "context-required" | "no-baseline";

export type MetricSemanticResult = {
  movement: MetricMovement;
  outcome: MetricOutcome;
};

export function interpretMetricMovement(input: {
  currentValue: number;
  previousValue: number;
  direction: MetricDirection;
}): MetricSemanticResult {
  const movement: MetricMovement =
    input.previousValue === 0
      ? input.currentValue === 0
        ? "flat"
        : "no-baseline"
      : input.currentValue > input.previousValue
        ? "up"
        : input.currentValue < input.previousValue
          ? "down"
          : "flat";

  if (movement === "no-baseline") {
    return { movement, outcome: "no-baseline" };
  }

  if (movement === "flat") {
    return { movement, outcome: "neutral" };
  }

  if (input.direction === "contextual") {
    return { movement, outcome: "context-required" };
  }

  const improved =
    (input.direction === "up" && movement === "up") ||
    (input.direction === "down" && movement === "down");

  return {
    movement,
    outcome: improved ? "improved" : "worsened",
  };
}
