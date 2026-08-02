import { describe, expect, it } from "vitest";
import { planMetricCsvImport } from "@/modules/growth-data/import-service";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

const pack: SectorPackManifest = {
  id: "education",
  version: "1.0.0",
  name: "Education",
  status: "active",
  funnels: [{ id: "enrollment", name: "Matrícula", stages: ["lead", "enrollment"] }],
  metrics: [{ id: "leads", name: "Leads", unit: "count", direction: "up" }],
  events: ["lead_created"],
};

describe("metric csv import planning", () => {
  it("rejects metrics outside the selected sector pack", () => {
    const csv = [
      "metric_id,period_start,period_end,value",
      "leads,2026-08-01,2026-08-01,10",
      "revenue,2026-08-01,2026-08-01,100",
    ].join("\n");

    const plan = planMetricCsvImport({
      content: csv,
      workspaceId: "ws-1",
      sectorPack: pack,
      idFactory: (row) => `obs-${row}`,
    });

    expect(plan.accepted.map((item) => item.metricId)).toEqual(["leads"]);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.fingerprint).toHaveLength(64);
  });
});
