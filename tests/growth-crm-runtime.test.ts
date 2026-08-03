import { describe, expect, it, vi } from "vitest";

import { resolveHubSpotDealContactAssociations } from "@/modules/growth-crm/hubspot-associations";
import { runDueCrmSyncs } from "@/modules/growth-crm/scheduled-sync-service";

const connection = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  provider: "HUBSPOT" as const,
  externalAccountId: "portal-1",
  displayName: "HubSpot",
  status: "ACTIVE" as const,
  secretRef: "crm/hubspot/workspace-1",
  cursor: null,
  watermark: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  consecutiveFailures: 0,
};

describe("CRM scheduled runtime", () => {
  it("honors an already expired deadline before resolving credentials", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([connection]),
    };
    const result = await runDueCrmSyncs(
      {
        database: database as never,
        secrets: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
        resolveAdapter: vi.fn(() => { throw new Error("adapter must not be resolved"); }),
        resolveRefresher: vi.fn(() => null),
        resolveSectorPack: vi.fn(() => { throw new Error("pack must not be resolved"); }),
      },
      { now: new Date("2026-08-03T12:00:00.000Z"), deadlineAt: new Date(0) },
    );
    expect(result).toEqual([]);
  });
});

describe("HubSpot deal-contact associations", () => {
  it("links a deal to an already-ingested contact without exposing contact PII", async () => {
    const database = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: "deal-row", externalId: "900" }])
        .mockResolvedValueOnce([{ id: "lead-row" }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ from: { id: "900" }, to: [{ toObjectId: "700" }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await resolveHubSpotDealContactAssociations({
      database: database as never,
      connection,
      accessToken: "synthetic-token",
      fetchImpl,
    });

    expect(result).toEqual({ dealsRead: 1, linked: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
