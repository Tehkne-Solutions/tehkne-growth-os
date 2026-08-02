import { describe, expect, it, vi } from "vitest";

import { evaluateConnectorHealth } from "@/modules/growth-connectors/freshness";
import {
  connectorRecordDeduplicationKey,
  runIncrementalConnectorSync,
  type NormalizedConnectorRecord,
} from "@/modules/growth-connectors/runtime";

const now = new Date("2026-08-03T12:00:00.000Z");

describe("connector freshness", () => {
  it("marks recent successful data as fresh", () => {
    const health = evaluateConnectorHealth({
      status: "ACTIVE",
      checkpoint: {
        cursor: "c1",
        watermark: now,
        lastSuccessAt: new Date("2026-08-03T10:30:00.000Z"),
        lastAttemptAt: new Date("2026-08-03T10:30:00.000Z"),
        consecutiveFailures: 0,
      },
      now,
    });
    expect(health.freshness).toBe("fresh");
    expect(health.healthy).toBe(true);
  });

  it("marks repeated failures as stale even inside the time SLO", () => {
    const health = evaluateConnectorHealth({
      status: "ACTIVE",
      checkpoint: {
        cursor: null,
        watermark: null,
        lastSuccessAt: new Date("2026-08-03T11:30:00.000Z"),
        lastAttemptAt: now,
        consecutiveFailures: 3,
      },
      now,
    });
    expect(health.freshness).toBe("stale");
    expect(health.reason).toBe("repeated_failures");
  });
});

describe("incremental connector runtime", () => {
  it("walks pages, preserves checkpoint progression and aggregates counters", async () => {
    const pages: Array<Readonly<{
      records: readonly NormalizedConnectorRecord[];
      nextCursor: string | null;
      watermark: Date | null;
      hasMore: boolean;
    }>> = [
      {
        records: [{ externalId: "row-1", occurredAt: now, payload: { clicks: 10 } }],
        nextCursor: "page-2",
        watermark: new Date("2026-08-03T11:00:00.000Z"),
        hasMore: true,
      },
      {
        records: [{ externalId: "row-2", occurredAt: now, payload: { clicks: 20 } }],
        nextCursor: null,
        watermark: new Date("2026-08-03T12:00:00.000Z"),
        hasMore: false,
      },
    ];
    const fetchPage = vi.fn().mockResolvedValueOnce(pages[0]).mockResolvedValueOnce(pages[1]);
    const persist = vi.fn().mockResolvedValueOnce({ written: 1, deduplicated: 0 }).mockResolvedValueOnce({ written: 0, deduplicated: 1 });

    const result = await runIncrementalConnectorSync({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      externalAccountId: "act-123",
      secretRef: "secret://meta/account-123",
      checkpoint: null,
      adapter: { provider: "META_ADS", mode: "read-only", fetchPage },
      persist,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1]?.[0].cursor).toBe("page-2");
    expect(result).toMatchObject({ recordsRead: 2, recordsWritten: 1, recordsDeduplicated: 1, nextCursor: null });
  });

  it("scopes deduplication keys by workspace and provider", () => {
    const first = connectorRecordDeduplicationKey({ workspaceId: "ws-a", provider: "META_ADS", externalAccountId: "1", externalId: "same" });
    const second = connectorRecordDeduplicationKey({ workspaceId: "ws-b", provider: "META_ADS", externalAccountId: "1", externalId: "same" });
    const third = connectorRecordDeduplicationKey({ workspaceId: "ws-a", provider: "GOOGLE_ADS", externalAccountId: "1", externalId: "same" });
    expect(first).toHaveLength(64);
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
  });
});
