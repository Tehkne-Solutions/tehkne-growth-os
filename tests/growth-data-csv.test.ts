import { describe, expect, it } from "vitest";
import { parseMetricCsvRow } from "@/modules/growth-data/csv";

describe("metric csv parser", () => {
  it("normalizes a canonical row", () => {
    const observation = parseMetricCsvRow({
      metric_id: "leads",
      period_start: "2026-08-01",
      period_end: "2026-08-01",
      value: "12",
    }, "ws-1", "obs-1");

    expect(observation.metricId).toBe("leads");
    expect(observation.value).toBe(12);
    expect(observation.source).toBe("csv");
    expect(observation.workspaceId).toBe("ws-1");
  });

  it("rejects invalid numeric values", () => {
    expect(() => parseMetricCsvRow({
      metric_id: "leads",
      period_start: "2026-08-01",
      period_end: "2026-08-01",
      value: "twelve",
    }, "ws-1", "obs-1")).toThrow(/numeric/);
  });

  it("rejects inverted periods", () => {
    expect(() => parseMetricCsvRow({
      metric_id: "leads",
      period_start: "2026-08-02",
      period_end: "2026-08-01",
      value: "1",
    }, "ws-1", "obs-1")).toThrow(/period_end/);
  });
});
