import { describe, expect, it } from "vitest";

import { deriveDecisionSignals } from "@/modules/growth-intelligence/decision-signals";
import type { InterpretedCommandCenterMetric } from "@/modules/growth-intelligence/enrich-command-center";

function metric(overrides: Partial<InterpretedCommandCenterMetric>): InterpretedCommandCenterMetric {
  return {
    metricId: "leads",
    currency: null,
    currentValue: 120,
    previousValue: 100,
    absoluteDelta: 20,
    percentageDelta: 20,
    trend: "up",
    direction: "up",
    outcome: "improved",
    goal: null,
    ...overrides,
  };
}

describe("growth decision signals", () => {
  it("prioritizes worsened metrics that are also outside target", () => {
    const signals = deriveDecisionSignals([
      metric({
        metricId: "cpl",
        currency: "BRL",
        currentValue: 124,
        previousValue: 100,
        absoluteDelta: 24,
        percentageDelta: 24,
        direction: "down",
        outcome: "worsened",
        goal: {
          targetValue: 100,
          currentValue: 124,
          absoluteGap: 24,
          attainmentPercent: 80.645,
          status: "not-met",
        },
      }),
      metric({
        metricId: "leads",
        goal: {
          targetValue: 110,
          currentValue: 120,
          absoluteGap: 10,
          attainmentPercent: 109.09,
          status: "met",
        },
      }),
    ]);

    expect(signals[0]?.severity).toBe("critical");
    expect(signals[0]?.metricId).toBe("cpl");
    expect(signals[1]?.severity).toBe("positive");
  });

  it("keeps contextual metrics explicitly non-judgmental", () => {
    const signals = deriveDecisionSignals([
      metric({
        metricId: "spend",
        direction: "contextual",
        outcome: "context-required",
      }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.severity).toBe("context");
  });
});
