import { describe, expect, it, vi } from "vitest";

import {
  buildOperationsNotificationFingerprint,
  deliverOperationsNotifications,
  postOperationsWebhookWithRetry,
  type OperationsNotificationCandidate,
} from "@/modules/growth-operations/notifications";
import { auditProductionReadiness } from "@/modules/growth-operations/production-readiness";

const candidate: OperationsNotificationCandidate = {
  key: "paid:connection-1:stale_data",
  source: "PAID_MEDIA",
  severity: "warning",
  connectionId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  provider: "GOOGLE_ADS",
  title: "Google Ads precisa de atenção",
  detail: "Dados stale.",
  reason: "stale_data",
};

describe("operations notifications", () => {
  it("deduplicates the same operational alert inside a six-hour window", () => {
    const first = buildOperationsNotificationFingerprint(candidate, new Date("2026-08-03T12:00:00.000Z"));
    const second = buildOperationsNotificationFingerprint(candidate, new Date("2026-08-03T15:59:59.000Z"));
    const later = buildOperationsNotificationFingerprint(candidate, new Date("2026-08-03T18:00:00.000Z"));
    expect(first).toBe(second);
    expect(later).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not touch persistence when no webhook is configured", async () => {
    const database = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const result = await deliverOperationsNotifications(database as never, [candidate], {});
    expect(result).toEqual({ configured: false, attempted: 0, sent: 0, failed: 0, deduplicated: 0 });
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it("retries transient webhook failures and succeeds within the bounded attempt budget", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await postOperationsWebhookWithRetry(
      "https://ops.example.test/hook",
      candidate,
      new Date("2026-08-03T12:00:00.000Z"),
      undefined,
      3,
      fetchImpl as typeof fetch,
    );
    expect(result).toEqual({ ok: true, attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent client errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const result = await postOperationsWebhookWithRetry(
      "https://ops.example.test/hook",
      candidate,
      new Date("2026-08-03T12:00:00.000Z"),
      undefined,
      3,
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("production readiness", () => {
  it("requires verified first syncs and a healthy scheduler for ready status", async () => {
    const database = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ active: 2, verified: 2, failures: 0 }])
        .mockResolvedValueOnce([{ active: 1, verified: 1, failures: 0 }])
        .mockResolvedValueOnce([{ status: "SUCCEEDED", startedAt: new Date("2026-08-03T11:00:00.000Z") }]),
    };
    const snapshot = await auditProductionReadiness(
      database as never,
      "00000000-0000-4000-8000-000000000002",
      {
        NODE_ENV: "test",
        SESSION_SECRET: "session-secret-marker",
        CONNECTOR_SECRET_MASTER_KEY: "master-key-marker",
        CRON_SECRET: "cron-marker",
        APP_URL: "https://growth.example.test",
        OPERATIONS_ALERT_WEBHOOK_URL: "https://ops.example.test/hook",
      },
      new Date("2026-08-03T12:00:00.000Z"),
    );
    expect(snapshot.status).toBe("ready");
    expect(snapshot.firstSync).toEqual({ paidMediaActive: 2, paidMediaVerified: 2, crmActive: 1, crmVerified: 1 });
    expect(snapshot.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("blocks rollout when an ACTIVE connector has not completed first sync", async () => {
    const database = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ active: 1, verified: 0, failures: 0 }])
        .mockResolvedValueOnce([{ active: 1, verified: 1, failures: 0 }])
        .mockResolvedValueOnce([{ status: "SUCCEEDED", startedAt: new Date("2026-08-03T11:00:00.000Z") }]),
    };
    const snapshot = await auditProductionReadiness(
      database as never,
      "00000000-0000-4000-8000-000000000002",
      {
        NODE_ENV: "test",
        SESSION_SECRET: "session-secret-marker",
        CONNECTOR_SECRET_MASTER_KEY: "master-key-marker",
        CRON_SECRET: "cron-marker",
        APP_URL: "https://growth.example.test",
      },
      new Date("2026-08-03T12:00:00.000Z"),
    );
    expect(snapshot.status).toBe("blocked");
    expect(snapshot.checks.find((check) => check.key === "paid-first-sync")?.status).toBe("fail");
  });
});
