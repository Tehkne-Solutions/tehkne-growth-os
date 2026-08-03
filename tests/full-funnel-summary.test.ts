import { describe, expect, it } from "vitest";

import { deriveFullFunnelSummary } from "@/modules/growth-intelligence/full-funnel-summary";

describe("full funnel summary", () => {
  it("keeps only canonical full-funnel metrics", () => {
    const summary = deriveFullFunnelSummary([
      metric("leads", 20, 10),
      metric("revenue", 5000, 4000, "BRL"),
      metric("spend", 1000, 900, "BRL"),
      metric("roas", 5, 4),
    ] as never);
    expect(summary.availableMetricIds).toEqual(["leads", "revenue", "roas"]);
    expect(summary.metrics).toHaveLength(3);
  });
});

function metric(metricId: string, currentValue: number, previousValue: number, currency: string | null = null) {
  return {
    metricId,
    currentValue,
    previousValue,
    percentageDelta: previousValue === 0 ? null : ((currentValue - previousValue) / previousValue) * 100,
    absoluteDelta: currentValue - previousValue,
    currency,
    direction: "up",
    outcome: "improved",
    goal: null,
  };
}
