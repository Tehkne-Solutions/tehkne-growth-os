import { describe, expect, it } from "vitest";

import { enrichCommandCenterIntelligence } from "@/modules/growth-intelligence/enrich-command-center";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

const pack: SectorPackManifest = {
  id: "growth-services",
  version: "1.0.0",
  name: "Growth Services",
  status: "active",
  funnels: [{ id: "acquisition", name: "Aquisição", stages: ["visit", "lead"] }],
  metrics: [
    { id: "leads", name: "Leads", unit: "count", direction: "up" },
    { id: "cpl", name: "CPL", unit: "currency", direction: "down" },
    { id: "spend", name: "Investimento", unit: "currency", direction: "contextual" },
  ],
  events: ["lead_created"],
};

const intelligence = {
  workspaceId: "ws-1",
  current: { workspaceId: "ws-1", from: new Date("2026-08-01"), to: new Date("2026-08-31"), metrics: [], eventCount: 0, latestImport: null },
  previous: { workspaceId: "ws-1", from: new Date("2026-07-01"), to: new Date("2026-07-31"), metrics: [], eventCount: 0, latestImport: null },
  metrics: [
    { metricId: "leads", currency: null, currentValue: 120, previousValue: 100, absoluteDelta: 20, percentageDelta: 20, trend: "up" as const },
    { metricId: "cpl", currency: "BRL", currentValue: 18, previousValue: 20, absoluteDelta: -2, percentageDelta: -10, trend: "down" as const },
    { metricId: "spend", currency: "BRL", currentValue: 1000, previousValue: 900, absoluteDelta: 100, percentageDelta: 11.111, trend: "up" as const },
  ],
  eventCount: { current: 0, previous: 0, absoluteDelta: 0, percentageDelta: 0, trend: "flat" as const },
};

describe("command center semantic enrichment", () => {
  it("distinguishes movement from performance and evaluates matching goals", () => {
    const result = enrichCommandCenterIntelligence({
      intelligence,
      sectorPack: pack,
      goals: [
        { id: "goal-1", workspaceId: "ws-1", metricId: "leads", currency: null, targetValue: 110, validFrom: new Date("2026-08-01"), validTo: null },
        { id: "goal-2", workspaceId: "ws-1", metricId: "cpl", currency: "BRL", targetValue: 19, validFrom: new Date("2026-08-01"), validTo: null },
      ],
    });

    const leads = result.interpretedMetrics.find((metric) => metric.metricId === "leads")!;
    const cpl = result.interpretedMetrics.find((metric) => metric.metricId === "cpl")!;
    const spend = result.interpretedMetrics.find((metric) => metric.metricId === "spend")!;

    expect(leads.outcome).toBe("improved");
    expect(leads.goal?.status).toBe("met");
    expect(cpl.outcome).toBe("improved");
    expect(cpl.goal?.status).toBe("met");
    expect(spend.outcome).toBe("context-required");
    expect(spend.goal).toBeNull();
  });

  it("does not infer semantics when no sector pack is resolved", () => {
    const result = enrichCommandCenterIntelligence({ intelligence, sectorPack: null, goals: [] });
    expect(result.interpretedMetrics.every((metric) => metric.outcome === "unknown-metric")).toBe(true);
  });
});
