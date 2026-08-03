import { describe, expect, it, vi } from "vitest";

import { HubSpotCrmAdapter } from "@/modules/growth-crm/hubspot-adapter";
import { buildLeadIdentityHash } from "@/modules/growth-crm/identity";

describe("CRM lead identity", () => {
  it("normalizes email before hashing without exposing the identifier", () => {
    const first = buildLeadIdentityHash({ email: " Person@Example.com " });
    const second = buildLeadIdentityHash({ email: "person@example.com" });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("person@example.com");
  });

  it("falls back to normalized phone when email is unavailable", () => {
    expect(buildLeadIdentityHash({ phone: "+55 (11) 99999-0000" }))
      .toBe(buildLeadIdentityHash({ phone: "5511999990000" }));
  });
});

describe("HubSpot CRM adapter", () => {
  it("maps contacts without returning raw email or phone properties", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: "101",
        properties: {
          email: "lead@example.com",
          phone: "+5511999990000",
          lifecyclestage: "lead",
          createdate: "2026-08-01T10:00:00.000Z",
          lastmodifieddate: "2026-08-02T10:00:00.000Z",
        },
      }],
    }), { status: 200 }));
    const adapter = new HubSpotCrmAdapter({ fetchImpl: fetchImpl as typeof fetch });
    const page = await adapter.readPage({
      accessToken: "synthetic-access-marker",
      cursor: null,
      updatedAfter: null,
      limit: 100,
    });

    expect(page.leads).toHaveLength(1);
    expect(page.leads[0]?.externalId).toBe("101");
    expect(page.leads[0]?.lifecycleStage).toBe("lead");
    expect(page.leads[0]?.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(page.leads[0]?.properties).toEqual({});
    expect(page.nextCursor).toBe("deals:");
  });

  it("maps won deals into canonical opportunities", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: "deal-1",
        properties: {
          pipeline: "default",
          dealstage: "closedwon",
          amount: "2500.50",
          deal_currency_code: "brl",
          createdate: "2026-08-01T10:00:00.000Z",
          hs_lastmodifieddate: "2026-08-02T10:00:00.000Z",
          closedate: "2026-08-02T09:00:00.000Z",
          hs_is_closed: "true",
          hs_is_closed_won: "true",
        },
      }],
    }), { status: 200 }));
    const adapter = new HubSpotCrmAdapter({ fetchImpl: fetchImpl as typeof fetch });
    const page = await adapter.readPage({
      accessToken: "synthetic-access-marker",
      cursor: "deals:",
      updatedAfter: new Date("2026-08-01T00:00:00.000Z"),
      limit: 100,
    });

    expect(page.opportunities[0]).toMatchObject({
      externalId: "deal-1",
      pipelineId: "default",
      stageId: "closedwon",
      amount: 2500.5,
      currency: "BRL",
      status: "WON",
    });
    expect(page.nextCursor).toBeNull();
  });
});
