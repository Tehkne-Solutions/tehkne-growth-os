import { describe, expect, it } from "vitest";

import {
  calculateBudgetPacing,
  calculatePerformanceAnomaly,
} from "@/modules/client-operations/budget-pacing";

const periodStart = new Date("2026-08-01T00:00:00.000Z");
const periodEnd = new Date("2026-08-31T00:00:00.000Z");

describe("budget pacing", () => {
  it("keeps observations before the plan window NOT_STARTED", () => {
    const result = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-07-31T12:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 0,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    expect(result).toEqual({ elapsedRatio: 0, expectedSpend: 0, projectedSpend: null, deviationPct: 0, status: "NOT_STARTED" });
  });

  it("is ON_TRACK when spend follows elapsed time", () => {
    const result = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-08-16T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 15000,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    expect(result.elapsedRatio).toBeCloseTo(0.5, 6);
    expect(result.expectedSpend).toBeCloseTo(15000, 4);
    expect(result.projectedSpend).toBeCloseTo(30000, 4);
    expect(result.deviationPct).toBeCloseTo(0, 6);
    expect(result.status).toBe("ON_TRACK");
  });

  it("distinguishes watch and critical over-pacing", () => {
    const watch = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-08-16T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 17000,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    const critical = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-08-16T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 19500,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    expect(watch.status).toBe("WATCH_OVER");
    expect(critical.status).toBe("CRITICAL_OVER");
  });

  it("distinguishes watch and critical under-pacing", () => {
    const watch = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-08-16T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 13000,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    const critical = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-08-16T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 10000,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    expect(watch.status).toBe("WATCH_UNDER");
    expect(critical.status).toBe("CRITICAL_UNDER");
  });

  it("marks observations at/after period end COMPLETE without hiding final deviation", () => {
    const result = calculateBudgetPacing({
      periodStart,
      periodEnd,
      observedAt: new Date("2026-09-01T00:00:00.000Z"),
      budgetAmount: 30000,
      actualSpend: 33000,
      warningDeviationPct: 10,
      criticalDeviationPct: 25,
    });
    expect(result.status).toBe("COMPLETE");
    expect(result.elapsedRatio).toBe(1);
    expect(result.expectedSpend).toBe(30000);
    expect(result.projectedSpend).toBe(33000);
    expect(result.deviationPct).toBeCloseTo(10, 6);
  });
});

describe("performance anomaly calculation", () => {
  it("classifies direction and magnitude without deciding whether the movement is good or bad", () => {
    const result = calculatePerformanceAnomaly({
      observedValue: 120,
      baselineValue: 100,
      watchThresholdPct: 10,
      highThresholdPct: 20,
      criticalThresholdPct: 40,
    });
    expect(result.direction).toBe("ABOVE");
    expect(result.deviationPct).toBeCloseTo(20, 6);
    expect(result.severity).toBe("HIGH");
  });

  it("uses absolute magnitude for severity while preserving BELOW direction", () => {
    const result = calculatePerformanceAnomaly({
      observedValue: 55,
      baselineValue: 100,
      watchThresholdPct: 10,
      highThresholdPct: 20,
      criticalThresholdPct: 40,
    });
    expect(result.direction).toBe("BELOW");
    expect(result.deviationPct).toBeCloseTo(-45, 6);
    expect(result.severity).toBe("CRITICAL");
  });

  it("does not invent a percentage anomaly when baseline is zero", () => {
    const result = calculatePerformanceAnomaly({
      observedValue: 12,
      baselineValue: 0,
      watchThresholdPct: 10,
      highThresholdPct: 20,
      criticalThresholdPct: 40,
    });
    expect(result.direction).toBe("ABOVE");
    expect(result.absoluteDelta).toBe(12);
    expect(result.deviationPct).toBeNull();
    expect(result.severity).toBe("UNCLASSIFIED");
  });
});
