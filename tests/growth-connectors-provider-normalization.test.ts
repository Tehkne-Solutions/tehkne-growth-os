import { describe, expect, it, vi } from "vitest";

import {
  expandCampaignPerformanceToMetricObservations,
  providerMetricSourceKey,
} from "@/modules/growth-connectors/performance-normalization";
import { persistProviderCampaignPerformance } from "@/modules/growth-connectors/performance-persistence";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

const record = {
  provider: "GOOGLE_ADS" as const,
  externalAccountId: "123",
  campaignId: "cmp-1",
  campaignName: "Search",
  date: "2026-08-01",
  currency: "BRL",
  spend: 100,
  impressions: 1000,
  clicks: 50,
  conversions: 5,
};

const pack: SectorPackManifest = {
  id: "growth-services",
  version: "1.0.0",
  name: "Growth Services",
  status: "active",
  funnels: [{ id: "acquisition", name: "Aquisição", stages: ["impression", "lead"] }],
  metrics: [
    { id: "impressions", name: "Impressões", unit: "count", direction: "up" },
    { id: "clicks", name: "Cliques", unit: "count", direction: "up" },
    { id: "spend", name: "Investimento", unit: "currency", direction: "contextual" },
  ],
  events: ["media_spend_recorded"],
};

describe("paid media normalization", () => {
  it("derives CTR and CPC with provider-independent units", () => {
    const observations = expandCampaignPerformanceToMetricObservations("ws-1", record);
    expect(observations.find((item) => item.metricId === "ctr")?.value).toBe(5);
    expect(observations.find((item) => item.metricId === "cpc")?.value).toBe(2);
    expect(observations.find((item) => item.metricId === "spend")?.currency).toBe("BRL");
  });

  it("creates deterministic metric source keys", () => {
    const first = providerMetricSourceKey({ workspaceId: "ws-1", record, metricId: "clicks" });
    const second = providerMetricSourceKey({ workspaceId: "ws-1", record, metricId: "clicks" });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toBe(providerMetricSourceKey({ workspaceId: "ws-2", record, metricId: "clicks" }));
  });

  it("persists only metrics declared by the selected sector pack", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const database = { $executeRaw: executeRaw } as never;
    const result = await persistProviderCampaignPerformance(database, {
      workspaceId: "33333333-3333-4333-8333-333333333333",
      sectorPack: pack,
      records: [record],
    });
    expect(result.produced).toBe(6);
    expect(result.accepted).toBe(3);
    expect(result.written).toBe(3);
    expect(result.skippedMetricIds).toEqual(["conversions", "cpc", "ctr"]);
    expect(executeRaw).toHaveBeenCalledTimes(3);
  });
});
