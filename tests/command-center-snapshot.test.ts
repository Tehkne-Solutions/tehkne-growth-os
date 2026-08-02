import { describe, expect, it } from "vitest";
import { buildCommandCenterSnapshot } from "@/modules/growth-data/command-center";

const start = new Date("2026-08-01T00:00:00.000Z");
const end = new Date("2026-08-31T23:59:59.999Z");

describe("command center snapshot", () => {
  it("aggregates metrics inside the selected period", () => {
    const snapshot = buildCommandCenterSnapshot({
      workspaceId: "ws-1",
      periodStart: start,
      periodEnd: end,
      observations: [
        { id: "1", workspaceId: "ws-1", metricId: "leads", periodStart: start, periodEnd: start, value: 10, source: "csv", dimensions: {} },
        { id: "2", workspaceId: "ws-1", metricId: "leads", periodStart: end, periodEnd: end, value: 5, source: "csv", dimensions: {} },
      ],
    });

    expect(snapshot.metrics).toEqual([{ metricId: "leads", value: 15, observations: 2 }]);
  });

  it("rejects cross-workspace observations", () => {
    expect(() => buildCommandCenterSnapshot({
      workspaceId: "ws-1",
      periodStart: start,
      periodEnd: end,
      observations: [
        { id: "1", workspaceId: "ws-2", metricId: "leads", periodStart: start, periodEnd: end, value: 1, source: "csv", dimensions: {} },
      ],
    })).toThrow(/Cross-workspace/);
  });

  it("ignores observations outside the selected period", () => {
    const snapshot = buildCommandCenterSnapshot({
      workspaceId: "ws-1",
      periodStart: start,
      periodEnd: end,
      observations: [
        { id: "1", workspaceId: "ws-1", metricId: "leads", periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31"), value: 99, source: "csv", dimensions: {} },
      ],
    });

    expect(snapshot.metrics).toEqual([]);
  });
});
