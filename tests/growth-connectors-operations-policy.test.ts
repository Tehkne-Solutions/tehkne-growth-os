import { describe, expect, it, vi } from "vitest";

import {
  ProviderHttpError,
  classifyConnectorFailure,
  planPaidMediaSyncWindow,
  retryDelayMs,
  withConnectorRetry,
} from "@/modules/growth-connectors/operations-policy";

describe("connector operations policy", () => {
  it("plans an initial bounded lookback window", () => {
    expect(planPaidMediaSyncWindow({
      watermark: null,
      now: new Date("2026-08-03T12:00:00Z"),
      initialLookbackDays: 14,
    })).toEqual({ startDate: "2026-07-21", endDate: "2026-08-03" });
  });

  it("overlaps a previous watermark without exceeding the max window", () => {
    expect(planPaidMediaSyncWindow({
      watermark: new Date("2026-08-01T23:59:59.999Z"),
      now: new Date("2026-08-03T12:00:00Z"),
      overlapDays: 2,
    })).toEqual({ startDate: "2026-07-30", endDate: "2026-08-03" });
  });

  it("classifies rate limits and authorization failures separately", () => {
    expect(classifyConnectorFailure(new ProviderHttpError("rate limited", 429))).toBe("rate_limit");
    expect(classifyConnectorFailure(new ProviderHttpError("expired", 401))).toBe("authorization");
    expect(retryDelayMs(1, new ProviderHttpError("busy", 503))).toBe(2_000);
    expect(retryDelayMs(1, new ProviderHttpError("rate", 429, 15_000))).toBe(15_000);
    expect(retryDelayMs(1, new ProviderHttpError("forbidden", 403))).toBeNull();
  });

  it("retries transient failures but stops on success", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn()
      .mockRejectedValueOnce(new ProviderHttpError("busy", 503))
      .mockResolvedValue("ok");
    await expect(withConnectorRetry(operation, { sleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });
});
