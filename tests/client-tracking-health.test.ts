import { describe, expect, it } from "vitest";

import {
  buildClientTrackingHealth,
  CLIENT_TRACKING_HEALTH_CATALOG,
  type ClientTrackingHealthItem,
} from "@/modules/client-operations/tracking-health";

describe("client tracking health", () => {
  it("keeps the canonical tracking catalog fixed", () => {
    expect(CLIENT_TRACKING_HEALTH_CATALOG.map((item) => item.key)).toEqual([
      "GA4_COLLECTION",
      "GTM_CONTAINER",
      "GOOGLE_ADS_CONVERSION",
      "META_PIXEL_DATASET",
      "CAPI_SERVER_SIDE",
      "EVENT_DEDUPLICATION",
      "ENHANCED_CONVERSIONS",
      "CONSENT_PRIVACY",
      "END_TO_END_SMOKE",
    ]);
  });

  it("keeps missing evidence unknown instead of fabricating health", () => {
    const health = buildClientTrackingHealth([]);
    expect(health.overallStatus).toBe("UNKNOWN");
    expect(health.pendingCount).toBe(CLIENT_TRACKING_HEALTH_CATALOG.length);
    expect(health.healthyCount).toBe(0);
  });

  it("is healthy only when every applicable check is healthy", () => {
    const rows = CLIENT_TRACKING_HEALTH_CATALOG.map((item, index) => row(
      item.key,
      index < 7 ? "HEALTHY" : "NOT_APPLICABLE",
    ));
    const health = buildClientTrackingHealth(rows);
    expect(health.overallStatus).toBe("HEALTHY");
    expect(health.healthyCount).toBe(7);
    expect(health.notApplicableCount).toBe(2);
    expect(health.brokenCount).toBe(0);
  });

  it("degrades when any applicable check is degraded and none are broken", () => {
    const rows = CLIENT_TRACKING_HEALTH_CATALOG.map((item) => row(item.key, "HEALTHY"));
    rows[4] = row("CAPI_SERVER_SIDE", "DEGRADED");
    const health = buildClientTrackingHealth(rows);
    expect(health.overallStatus).toBe("DEGRADED");
    expect(health.degradedCount).toBe(1);
  });

  it("treats a single broken check as the dominant state", () => {
    const rows = CLIENT_TRACKING_HEALTH_CATALOG.map((item) => row(item.key, "HEALTHY"));
    rows[8] = row("END_TO_END_SMOKE", "BROKEN");
    const health = buildClientTrackingHealth(rows);
    expect(health.overallStatus).toBe("BROKEN");
    expect(health.brokenCount).toBe(1);
  });

  it("stays pending when evidence is mixed but not yet healthy", () => {
    const rows = [
      row("GA4_COLLECTION", "HEALTHY"),
      row("GTM_CONTAINER", "PENDING"),
    ];
    const health = buildClientTrackingHealth(rows);
    expect(health.overallStatus).toBe("PENDING");
    expect(health.pendingCount).toBeGreaterThan(0);
  });
});

function row(
  itemKey: ClientTrackingHealthItem["itemKey"],
  status: ClientTrackingHealthItem["status"],
): ClientTrackingHealthItem {
  return {
    workspaceId: "93000000-0000-4000-8000-000000000001",
    itemKey,
    status,
    evidenceReference: null,
    assessedByUserId: "93000000-0000-4000-8000-000000000002",
    assessedAt: new Date("2026-08-08T00:00:00.000Z"),
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    updatedAt: new Date("2026-08-08T00:00:00.000Z"),
  };
}
