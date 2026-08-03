import { describe, expect, it, vi } from "vitest";

import { deriveAttributionCandidate } from "@/modules/growth-attribution/foundation";
import { HubSpotCrmAdapter } from "@/modules/growth-crm/hubspot-adapter";

describe("attribution capture", () => {
  it("captures configured Google click/campaign evidence without returning raw identifiers as lead properties", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: "lead-1",
        properties: {
          email: "lead@example.com",
          lifecyclestage: "lead",
          createdate: "2026-08-01T10:00:00.000Z",
          lastmodifieddate: "2026-08-02T10:00:00.000Z",
          custom_gclid: "click-marker-123",
          custom_google_campaign: "campaign-42",
        },
      }],
    }), { status: 200 }));
    const adapter = new HubSpotCrmAdapter({
      fetchImpl: fetchImpl as typeof fetch,
      attributionProperties: {
        gclid: "custom_gclid",
        googleCampaignId: "custom_google_campaign",
      },
    });

    const page = await adapter.readPage({
      accessToken: "synthetic-access-marker",
      cursor: null,
      updatedAfter: null,
      limit: 100,
    });

    expect(page.leads[0]?.properties).toEqual({});
    expect(page.leads[0]?.attributionEvidence).toEqual([
      { type: "CLICK_ID", value: "click-marker-123", provider: "GOOGLE_ADS", campaignId: "campaign-42" },
      { type: "EXPLICIT_CAMPAIGN_ID", value: "campaign-42", provider: "GOOGLE_ADS", campaignId: "campaign-42" },
    ]);
  });

  it("keeps UTM-only attribution at medium confidence", () => {
    const candidate = deriveAttributionCandidate({
      type: "UTM_CAMPAIGN_ID",
      value: "launch-q3",
      provider: "META_ADS",
      campaignId: "launch-q3",
    });
    expect(candidate.confidence).toBe("MEDIUM");
    expect(candidate.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate.evidenceHash).not.toContain("launch-q3");
  });
});
