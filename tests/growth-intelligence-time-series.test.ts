import { describe, expect, it } from "vitest";

import type { CommandCenterSnapshot } from "@/modules/command-center/query";
import { buildOlderEquivalentPeriods, deriveMetricTimeSeries } from "@/modules/growth-intelligence/time-series";

function snapshot(value: number, index: number): CommandCenterSnapshot {
  const from = new Date(Date.UTC(2026, 0, 1 + index));
  const to = new Date(Date.UTC(2026, 0, 1 + index, 23, 59, 59, 999));
  return {
    workspaceId: "ws-1",
    from,
    to,
    metrics: [{ metricId: "cpl", value, currency: "BRL" }],
    eventCount: 0,
    latestImport: null,
  };
}

describe("growth intelligence time series", () => {
  it("builds adjacent equivalent historical windows", () => {
    const periods = buildOlderEquivalentPeriods({
      from: new Date("2026-08-10T00:00:00.000Z"),
      to: new Date("2026-08-12T23:59:59.999Z"),
      count: 2,
    });

    expect(periods).toHaveLength(2);
    expect(periods[1]!.to.getTime()).toBe(new Date("2026-08-10T00:00:00.000Z").getTime() - 1);
    expect(periods[0]!.to.getTime()).toBe(periods[1]!.from.getTime() - 1);
  });

  it("detects falling acceleration and interprets it as improving for down metrics", () => {
    const series = deriveMetricTimeSeries({
      snapshots: [snapshot(100, 0), snapshot(90, 1), snapshot(70, 2)],
      directions: new Map([["cpl", "down"]]),
    });

    expect(series[0]).toMatchObject({
      metricId: "cpl",
      trend: "falling",
      momentum: "accelerating",
      performanceMomentum: "improving",
    });
  });

  it("detects reversal without treating contextual metrics as good or bad", () => {
    const series = deriveMetricTimeSeries({
      snapshots: [snapshot(100, 0), snapshot(80, 1), snapshot(90, 2)],
      directions: new Map([["cpl", "contextual"]]),
    });

    expect(series[0]).toMatchObject({
      trend: "mixed",
      momentum: "reversal",
      performanceMomentum: "context-required",
    });
  });
});
