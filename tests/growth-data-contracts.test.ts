import { describe, expect, it } from "vitest";
import { assertEventBelongsToPack, eventDeduplicationKey } from "@/modules/growth-data/events";
import { aggregateMetric, assertMetricBelongsToPack } from "@/modules/growth-data/metrics";
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

describe("growth data contracts", () => {
  it("accepts only metrics declared by the active sector pack", () => {
    expect(() => assertMetricBelongsToPack(pack, { metricId: "leads" })).not.toThrow();
    expect(() => assertMetricBelongsToPack(pack, { metricId: "revenue" })).toThrow(/not declared/);
  });

  it("accepts only events declared by the active sector pack", () => {
    expect(() => assertEventBelongsToPack(pack, { eventType: "lead_created" })).not.toThrow();
    expect(() => assertEventBelongsToPack(pack, { eventType: "purchase" })).toThrow(/not declared/);
  });

  it("creates stable tenant-aware hashed event deduplication keys", () => {
    const first = eventDeduplicationKey({ workspaceId: "ws-1", source: "csv", externalId: "row-10", id: "evt-1" });
    const second = eventDeduplicationKey({ workspaceId: "ws-1", source: "csv", externalId: "row-10", id: "evt-2" });
    const otherWorkspace = eventDeduplicationKey({ workspaceId: "ws-2", source: "csv", externalId: "row-10", id: "evt-1" });

    expect(first).toHaveLength(64);
    expect(first).toBe(second);
    expect(first).not.toBe(otherWorkspace);
  });

  it("aggregates metric observations", () => {
    expect(aggregateMetric([
      { id: "1", workspaceId: "ws", metricId: "leads", periodStart: new Date(), periodEnd: new Date(), value: 3, source: "csv", dimensions: {} },
      { id: "2", workspaceId: "ws", metricId: "leads", periodStart: new Date(), periodEnd: new Date(), value: 5, source: "csv", dimensions: {} },
    ])).toBe(8);
  });
});
