import { describe, expect, it } from "vitest";

import {
  buildClientHandoverChecklist,
  CLIENT_HANDOVER_CATALOG,
  type ClientHandoverItem,
} from "@/modules/client-operations/handover-checklist";

describe("client handover checklist", () => {
  it("keeps the agency handover catalog fixed and complete", () => {
    expect(CLIENT_HANDOVER_CATALOG.map((item) => item.key)).toEqual([
      "GOOGLE_ADS_MCC",
      "META_PARTNER_ACCESS",
      "GA4",
      "GTM",
      "WEBSITE_CMS",
      "LANDING_PAGES",
      "HUBSPOT_CRM",
      "META_PIXEL_DATASET",
      "CONVERSIONS_API",
      "DOMAIN_OWNERSHIP",
      "BILLING_OWNER",
      "TRACKING_SMOKE",
      "HANDOVER_CUTOVER",
    ]);
  });

  it("treats absent evidence as pending instead of inventing readiness", () => {
    const checklist = buildClientHandoverChecklist([]);
    expect(checklist.complete).toBe(false);
    expect(checklist.pendingCount).toBe(CLIENT_HANDOVER_CATALOG.length);
    expect(checklist.verifiedCount).toBe(0);
  });

  it("is complete only when every item is verified or explicitly not applicable", () => {
    const rows = CLIENT_HANDOVER_CATALOG.map((item, index) => row(
      item.key,
      index < 8 ? "VERIFIED" : "NOT_APPLICABLE",
    ));
    const checklist = buildClientHandoverChecklist(rows);
    expect(checklist.complete).toBe(true);
    expect(checklist.verifiedCount).toBe(8);
    expect(checklist.notApplicableCount).toBe(5);
    expect(checklist.blockedCount).toBe(0);
    expect(checklist.pendingCount).toBe(0);
  });

  it("keeps a single blocked item fail-closed", () => {
    const rows = CLIENT_HANDOVER_CATALOG.map((item) => row(item.key, "VERIFIED"));
    rows[3] = row("GTM", "BLOCKED");
    const checklist = buildClientHandoverChecklist(rows);
    expect(checklist.complete).toBe(false);
    expect(checklist.blockedCount).toBe(1);
  });
});

function row(
  itemKey: ClientHandoverItem["itemKey"],
  status: ClientHandoverItem["status"],
): ClientHandoverItem {
  const verified = status === "VERIFIED";
  return {
    workspaceId: "93000000-0000-4000-8000-000000000001",
    itemKey,
    status,
    externalReference: null,
    verifiedByUserId: verified ? "93000000-0000-4000-8000-000000000002" : null,
    verifiedAt: verified ? new Date("2026-08-08T00:00:00.000Z") : null,
    updatedByUserId: "93000000-0000-4000-8000-000000000002",
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    updatedAt: new Date("2026-08-08T00:00:00.000Z"),
  };
}
