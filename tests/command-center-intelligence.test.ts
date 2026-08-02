import { describe, expect, it } from "vitest";

import {
  compareCommandCenterSnapshots,
  previousEquivalentPeriod,
} from "@/modules/command-center/intelligence";
import type { CommandCenterSnapshot } from "@/modules/command-center/query";

function snapshot(
  workspaceId: string,
  metrics: CommandCenterSnapshot["metrics"],
  eventCount = 0,
): CommandCenterSnapshot {
  return {
    workspaceId,
    from: new Date("2026-08-01T00:00:00.000Z"),
    to: new Date("2026-08-31T23:59:59.999Z"),
    metrics,
    eventCount,
    latestImport: null,
  };
}

describe("command center intelligence", () => {
  it("builds an adjacent previous period with equivalent duration", () => {
    const current = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
    };
    const previous = previousEquivalentPeriod(current);

    expect(previous.to.getTime()).toBe(current.from.getTime() - 1);
    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      current.to.getTime() - current.from.getTime(),
    );
  });

  it("compares metrics and events without losing missing metrics", () => {
    const result = compareCommandCenterSnapshots(
      snapshot(
        "ws-1",
        [
          { metricId: "leads", value: 120, currency: null },
          { metricId: "spend", value: 900, currency: "BRL" },
        ],
        30,
      ),
      snapshot(
        "ws-1",
        [
          { metricId: "leads", value: 100, currency: null },
          { metricId: "cpl", value: 20, currency: "BRL" },
        ],
        20,
      ),
    );

    expect(result.metrics).toEqual([
      {
        metricId: "cpl",
        currency: "BRL",
        currentValue: 0,
        previousValue: 20,
        absoluteDelta: -20,
        percentageDelta: -100,
        trend: "down",
      },
      {
        metricId: "leads",
        currency: null,
        currentValue: 120,
        previousValue: 100,
        absoluteDelta: 20,
        percentageDelta: 20,
        trend: "up",
      },
      {
        metricId: "spend",
        currency: "BRL",
        currentValue: 900,
        previousValue: 0,
        absoluteDelta: 900,
        percentageDelta: null,
        trend: "no-baseline",
      },
    ]);
    expect(result.eventCount).toEqual({
      current: 30,
      previous: 20,
      absoluteDelta: 10,
      percentageDelta: 50,
      trend: "up",
    });
  });

  it("rejects cross-workspace comparisons", () => {
    expect(() =>
      compareCommandCenterSnapshots(snapshot("ws-a", []), snapshot("ws-b", [])),
    ).toThrow(/cannot mix workspaces/);
  });

  it("returns no-baseline instead of an infinite percentage", () => {
    const result = compareCommandCenterSnapshots(
      snapshot("ws-1", [{ metricId: "leads", value: 10, currency: null }]),
      snapshot("ws-1", []),
    );

    expect(result.metrics[0]).toMatchObject({
      percentageDelta: null,
      trend: "no-baseline",
    });
  });
});
