import { describe, expect, it } from "vitest";

import { deriveMomentumDecisionSignals, mergeDecisionSignals } from "@/modules/growth-intelligence/momentum-signals";
import type { MetricTimeSeries } from "@/modules/growth-intelligence/time-series";

function series(overrides: Partial<MetricTimeSeries> = {}): MetricTimeSeries {
  return {
    metricId: "cpl",
    currency: "BRL",
    points: [],
    trend: "rising",
    momentum: "accelerating",
    performanceMomentum: "worsening",
    ...overrides,
  };
}

describe("momentum decision signals", () => {
  it("prioritizes accelerating worsening trajectories", () => {
    const [signal] = deriveMomentumDecisionSignals([series()]);
    expect(signal).toMatchObject({ severity: "warning", priority: 75 });
    expect(signal?.title).toMatch(/piorando com aceleração/);
  });

  it("marks reversal as contextual instead of automatically good or bad", () => {
    const [signal] = deriveMomentumDecisionSignals([
      series({ momentum: "reversal", performanceMomentum: "improving", trend: "mixed" }),
    ]);
    expect(signal).toMatchObject({ severity: "context", priority: 40 });
  });

  it("keeps primary goal signals ahead when merging", () => {
    const result = mergeDecisionSignals(
      [{ key: "cpl:BRL", metricId: "cpl", currency: "BRL", severity: "critical", priority: 100, title: "critical", detail: "goal" }],
      deriveMomentumDecisionSignals([series()]),
    );
    expect(result.map((item) => item.priority)).toEqual([100, 75]);
  });
});
