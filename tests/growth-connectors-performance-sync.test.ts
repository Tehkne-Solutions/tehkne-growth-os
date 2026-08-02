import { describe, expect, it, vi } from "vitest";

import { syncPaidMediaPerformance } from "@/modules/growth-connectors/performance-sync-service";
import type { SecretPayload, SecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { SectorPackManifest } from "@/modules/sector-packs/types";

class MemorySecrets implements SecretProvider {
  readonly values = new Map<string, SecretPayload>();
  async put(ref: string, payload: SecretPayload) { this.values.set(ref, payload); }
  async get(ref: string) { return this.values.get(ref) ?? null; }
  async delete(ref: string) { this.values.delete(ref); }
}

const pack: SectorPackManifest = {
  id: "growth-services",
  version: "1.0.0",
  name: "Growth Services",
  status: "active",
  funnels: [{ id: "acquisition", name: "Aquisição", stages: ["impression", "lead"] }],
  metrics: [{ id: "spend", name: "Investimento", unit: "currency", direction: "contextual" }],
  events: ["media_spend_recorded"],
};

const connection = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "33333333-3333-4333-8333-333333333333",
  provider: "GOOGLE_ADS" as const,
  externalAccountId: "123",
  displayName: "Account",
  status: "ACTIVE" as const,
  secretRef: "tokens",
  checkpoint: null,
};

describe("paid media sync service", () => {
  it("records a successful sync and advances the watermark", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const database = { $executeRaw: executeRaw } as never;
    const reader = {
      readCampaignDailyPerformance: vi.fn().mockResolvedValue([{
        provider: "GOOGLE_ADS",
        externalAccountId: "123",
        campaignId: "cmp-1",
        campaignName: "Search",
        date: "2026-08-01",
        currency: "BRL",
        spend: 10,
        impressions: 100,
        clicks: 5,
      }]),
    };
    const result = await syncPaidMediaPerformance(
      { database, secrets: new MemorySecrets(), reader },
      { connection, sectorPack: pack, startDate: "2026-08-01", endDate: "2026-08-01", now: new Date("2026-08-02T00:00:00Z") },
    );
    expect(result.recordsRead).toBe(1);
    expect(result.observationsWritten).toBe(1);
    expect(result.watermark.toISOString()).toBe("2026-08-01T23:59:59.999Z");
    expect(executeRaw).toHaveBeenCalled();
  });

  it("records a failed sync without advancing the watermark", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const database = { $executeRaw: executeRaw } as never;
    const reader = { readCampaignDailyPerformance: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    await expect(syncPaidMediaPerformance(
      { database, secrets: new MemorySecrets(), reader },
      { connection, sectorPack: pack, startDate: "2026-08-01", endDate: "2026-08-01" },
    )).rejects.toThrow(/provider unavailable/);
    expect(executeRaw).toHaveBeenCalled();
  });
});
