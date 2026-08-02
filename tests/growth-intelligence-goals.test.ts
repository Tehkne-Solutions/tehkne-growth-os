import { describe, expect, it } from "vitest";

import { evaluateMetricGoal } from "@/modules/growth-intelligence/goals";

describe("metric goal evaluation", () => {
  it("marks higher-is-better targets as met", () => {
    const result = evaluateMetricGoal({ currentValue: 120, targetValue: 100, direction: "up" });
    expect(result.status).toBe("met");
    expect(result.absoluteGap).toBe(20);
    expect(result.attainmentPercent).toBe(120);
  });

  it("marks lower-is-better targets as met", () => {
    const result = evaluateMetricGoal({ currentValue: 15, targetValue: 20, direction: "down" });
    expect(result.status).toBe("met");
    expect(result.absoluteGap).toBe(-5);
    expect(result.attainmentPercent).toBeCloseTo(133.333333, 5);
  });

  it("does not judge contextual targets", () => {
    const result = evaluateMetricGoal({ currentValue: 800, targetValue: 1000, direction: "contextual" });
    expect(result.status).toBe("context-required");
    expect(result.attainmentPercent).toBeNull();
  });

  it("does not fabricate attainment against a zero target", () => {
    const result = evaluateMetricGoal({ currentValue: 5, targetValue: 0, direction: "up" });
    expect(result.status).toBe("met");
    expect(result.attainmentPercent).toBeNull();
  });
});
