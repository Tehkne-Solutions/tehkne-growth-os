import { describe, expect, it, vi } from "vitest";

import { runDueConnectorSyncs } from "@/modules/growth-connectors/scheduled-sync-service";

vi.mock("@/modules/growth-connectors/scheduled-sync-service", async (importOriginal) => {
  return importOriginal();
});

describe("connector scheduler deadline", () => {
  it("accepts an already-expired deadline without processing connections", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "00000000-0000-4000-8000-000000000001",
          workspaceId: "00000000-0000-4000-8000-000000000002",
          provider: "META_ADS",
          externalAccountId: "act_1",
          displayName: "Meta",
          status: "ACTIVE",
          secretRef: "secret-ref",
          cursor: null,
          watermark: null,
          lastSuccessAt: null,
          lastAttemptAt: null,
          consecutiveFailures: null,
        },
      ]),
    };

    const results = await runDueConnectorSyncs(
      {
        database: database as never,
        secrets: {} as never,
        resolveReader: vi.fn(() => { throw new Error("reader must not be resolved"); }),
        resolveRefresher: vi.fn(() => null),
        resolveSectorPack: vi.fn(() => { throw new Error("pack must not be resolved"); }),
      },
      {
        now: new Date("2026-08-03T12:00:00.000Z"),
        deadlineAt: new Date(0),
      },
    );

    expect(results).toEqual([]);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
