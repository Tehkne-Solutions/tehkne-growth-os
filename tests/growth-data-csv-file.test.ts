import { describe, expect, it } from "vitest";
import { previewMetricCsv } from "@/modules/growth-data/csv-file";

describe("metric csv file preview", () => {
  it("separates accepted and rejected rows", () => {
    const csv = [
      "metric_id,period_start,period_end,value,source,currency",
      "leads,2026-08-01,2026-08-01,12,csv,",
      "cpl,2026-08-01,2026-08-01,invalid,csv,BRL",
    ].join("\n");

    const result = previewMetricCsv(csv, "ws-1", (row) => `obs-${row}`);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.row).toBe(3);
  });

  it("supports quoted comma fields", () => {
    const csv = [
      "metric_id,period_start,period_end,value,source,currency",
      "leads,2026-08-01,2026-08-01,12,\"manual,import\",",
    ].join("\n");

    const result = previewMetricCsv(csv, "ws-1", () => "obs-1");
    expect(result.accepted[0]?.source).toBe("manual,import");
  });

  it("requires canonical headers", () => {
    expect(() => previewMetricCsv("metric,value\nleads,1", "ws", () => "1"))
      .toThrow(/Missing CSV header/);
  });
});
