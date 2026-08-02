import { describe, expect, it, vi } from "vitest";
import { loadCommandCenterSnapshot } from "@/modules/command-center/query";

describe("command center query", () => {
  it("keeps all reads scoped to one workspace", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { metricId: "leads", currency: null, _sum: { value: 12 } },
    ]);
    const count = vi.fn().mockResolvedValue(4);
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = {
      metricObservation: { groupBy },
      growthEvent: { count },
      metricImportBatch: { findFirst },
    } as never;

    const from = new Date("2026-08-01T00:00:00Z");
    const to = new Date("2026-08-31T23:59:59Z");
    const snapshot = await loadCommandCenterSnapshot(database, {
      workspaceId: "ws-1",
      from,
      to,
    });

    expect(snapshot.workspaceId).toBe("ws-1");
    expect(snapshot.metrics).toEqual([{ metricId: "leads", value: 12, currency: null }]);
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: "ws-1" }),
    }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: "ws-1" }),
    }));
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "ws-1" },
    }));
  });

  it("rejects inverted periods before querying", async () => {
    await expect(loadCommandCenterSnapshot({} as never, {
      workspaceId: "ws-1",
      from: new Date("2026-08-02T00:00:00Z"),
      to: new Date("2026-08-01T00:00:00Z"),
    })).rejects.toThrow(/Invalid command center period/);
  });
});
