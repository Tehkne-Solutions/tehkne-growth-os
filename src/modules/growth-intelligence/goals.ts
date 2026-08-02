import type { MetricDirection } from "@/modules/sector-packs/types";

export type MetricGoal = {
  id: string;
  workspaceId: string;
  metricId: string;
  currency: string | null;
  targetValue: number;
  validFrom: Date;
  validTo: Date | null;
};

export type MetricGoalEvaluation = {
  targetValue: number;
  currentValue: number;
  absoluteGap: number;
  attainmentPercent: number | null;
  status: "met" | "not-met" | "context-required";
};

export function evaluateMetricGoal(input: {
  currentValue: number;
  targetValue: number;
  direction: MetricDirection;
}): MetricGoalEvaluation {
  const absoluteGap = input.currentValue - input.targetValue;

  if (input.direction === "contextual") {
    return {
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      absoluteGap,
      attainmentPercent: null,
      status: "context-required",
    };
  }

  const met =
    input.direction === "up"
      ? input.currentValue >= input.targetValue
      : input.currentValue <= input.targetValue;

  const attainmentPercent = calculateAttainment({
    currentValue: input.currentValue,
    targetValue: input.targetValue,
    direction: input.direction,
  });

  return {
    targetValue: input.targetValue,
    currentValue: input.currentValue,
    absoluteGap,
    attainmentPercent,
    status: met ? "met" : "not-met",
  };
}

function calculateAttainment(input: {
  currentValue: number;
  targetValue: number;
  direction: Exclude<MetricDirection, "contextual">;
}): number | null {
  if (input.targetValue === 0) return null;

  if (input.direction === "up") {
    return (input.currentValue / input.targetValue) * 100;
  }

  if (input.currentValue === 0) {
    return input.targetValue >= 0 ? 100 : null;
  }

  return (input.targetValue / input.currentValue) * 100;
}
