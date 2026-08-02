import { describe, expect, it } from "vitest";

import {
  GoogleAdsPerformanceReader,
  MetaAdsPerformanceReader,
} from "@/modules/growth-connectors/paid-media-performance-adapters";
import type { SecretPayload, SecretProvider } from "@/modules/growth-connectors/secret-provider";

class MemorySecrets implements SecretProvider {
  readonly values = new Map<string, SecretPayload>();
  async put(ref: string, payload: SecretPayload) { this.values.set(ref, payload); }
  async get(ref: string) { return this.values.get(ref) ?? null; }
  async delete(ref: string) { this.values.delete(ref); }
}

describe("provider performance readers", () => {
  it("normalizes Google Ads searchStream campaign rows", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("tokens", { accessToken: "token-value" });
    await secrets.put("developer", { developerToken: "developer-value" });
    const fetcher = async () => new Response(JSON.stringify([{ results: [{
      campaign: { id: "10", name: "Search" },
      segments: { date: "2026-08-01" },
      customer: { currencyCode: "BRL" },
      metrics: { impressions: "1000", clicks: "50", costMicros: "100000000", conversions: 5 },
    }] }]), { status: 200, headers: { "content-type": "application/json" } });
    const reader = new GoogleAdsPerformanceReader({
      apiVersion: "v24",
      developerTokenSecretRef: "developer",
      fetcher: fetcher as typeof fetch,
    });
    const rows = await reader.readCampaignDailyPerformance({
      externalAccountId: "123-456-7890",
      tokenSecretRef: "tokens",
      secrets,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });
    expect(rows[0]).toMatchObject({ campaignId: "10", spend: 100, impressions: 1000, clicks: 50, conversions: 5, currency: "BRL" });
  });

  it("paginates Meta campaign insights", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("tokens", { accessToken: "token-value" });
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? {
        data: [{ campaign_id: "20", campaign_name: "Prospecting", date_start: "2026-08-01", spend: "25.5", impressions: "500", clicks: "20", account_currency: "BRL" }],
        paging: { next: "https://example.test/next" },
      } : {
        data: [{ campaign_id: "21", campaign_name: "Retargeting", date_start: "2026-08-01", spend: "10", impressions: "200", clicks: "8", account_currency: "BRL" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const reader = new MetaAdsPerformanceReader({ apiVersion: "v99.0", fetcher: fetcher as typeof fetch });
    const rows = await reader.readCampaignDailyPerformance({
      externalAccountId: "123",
      tokenSecretRef: "tokens",
      secrets,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ externalAccountId: "act_123", spend: 25.5, clicks: 20 });
    expect(calls).toBe(2);
  });
});
