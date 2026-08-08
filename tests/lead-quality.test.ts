import { describe, expect, it } from "vitest";

import {
  buildLeadQualitySegments,
  GROWTH_LEAD_QUALITY_CLASSES,
  summarizeLeadQuality,
  type GrowthLeadQualityObservation,
} from "@/modules/client-operations/lead-quality";

const workspaceId = "93000000-0000-4000-8000-000000000001";
const userId = "93000000-0000-4000-8000-000000000002";

describe("lead quality taxonomy", () => {
  it("keeps the quality ladder explicit and generic", () => {
    expect(GROWTH_LEAD_QUALITY_CLASSES).toEqual([
      "UNREVIEWED",
      "INVALID",
      "UNQUALIFIED",
      "QUALIFIED",
      "HIGH_QUALITY",
      "CONVERTED",
    ]);
  });

  it("uses only the latest observation for each lead", () => {
    const rows = [
      row("lead:1", "UNREVIEWED", "2026-08-01T10:00:00Z"),
      row("lead:1", "QUALIFIED", "2026-08-02T10:00:00Z"),
      row("lead:2", "INVALID", "2026-08-02T11:00:00Z"),
    ];
    const summary = summarizeLeadQuality(rows);
    expect(summary.totalLeads).toBe(2);
    expect(summary.reviewedLeads).toBe(2);
    expect(summary.unreviewedLeads).toBe(0);
    expect(summary.qualifiedLeads).toBe(1);
    expect(summary.invalidLeads).toBe(1);
    expect(summary.qualificationRate).toBe(50);
  });

  it("excludes UNREVIEWED leads from rate denominators", () => {
    const summary = summarizeLeadQuality([
      row("lead:1", "UNREVIEWED", "2026-08-01T10:00:00Z"),
      row("lead:2", "QUALIFIED", "2026-08-01T11:00:00Z"),
    ]);
    expect(summary.totalLeads).toBe(2);
    expect(summary.reviewedLeads).toBe(1);
    expect(summary.qualificationRate).toBe(100);
    expect(summary.invalidRate).toBe(0);
  });

  it("counts high quality and converted as qualified while preserving stronger indicators", () => {
    const summary = summarizeLeadQuality([
      row("lead:1", "QUALIFIED", "2026-08-01T10:00:00Z"),
      row("lead:2", "HIGH_QUALITY", "2026-08-01T11:00:00Z"),
      row("lead:3", "CONVERTED", "2026-08-01T12:00:00Z"),
      row("lead:4", "UNQUALIFIED", "2026-08-01T13:00:00Z"),
    ]);
    expect(summary.qualifiedLeads).toBe(3);
    expect(summary.highQualityLeads).toBe(2);
    expect(summary.convertedLeads).toBe(1);
    expect(summary.qualificationRate).toBe(75);
    expect(summary.highQualityRate).toBe(50);
    expect(summary.conversionRate).toBe(25);
  });

  it("groups quality by source/campaign as a dimension, not attribution", () => {
    const rows = [
      row("lead:1", "QUALIFIED", "2026-08-01T10:00:00Z", "META_ADS", "campaign:10"),
      row("lead:2", "INVALID", "2026-08-01T11:00:00Z", "META_ADS", "campaign:10"),
      row("lead:3", "HIGH_QUALITY", "2026-08-01T12:00:00Z", "GOOGLE_ADS", "campaign:20"),
    ];
    const segments = buildLeadQualitySegments(rows);
    expect(segments).toHaveLength(2);
    const meta = segments.find((segment) => segment.sourceChannel === "META_ADS");
    expect(meta?.campaignReference).toBe("campaign:10");
    expect(meta?.summary.reviewedLeads).toBe(2);
    expect(meta?.summary.qualificationRate).toBe(50);
  });

  it("returns null rates when nothing has been reviewed", () => {
    const summary = summarizeLeadQuality([row("lead:1", "UNREVIEWED", "2026-08-01T10:00:00Z")]);
    expect(summary.reviewedLeads).toBe(0);
    expect(summary.qualificationRate).toBeNull();
    expect(summary.highQualityRate).toBeNull();
    expect(summary.conversionRate).toBeNull();
    expect(summary.invalidRate).toBeNull();
  });
});

function row(
  leadReference: string,
  qualityClass: GrowthLeadQualityObservation["qualityClass"],
  observedAt: string,
  sourceChannel: GrowthLeadQualityObservation["sourceChannel"] = "OTHER",
  campaignReference: string | null = null,
): GrowthLeadQualityObservation {
  const timestamp = new Date(observedAt);
  return {
    id: `${leadReference}-${timestamp.getTime()}`,
    workspaceId,
    leadReference,
    sourceChannel,
    campaignReference,
    qualityClass,
    reasonCode: null,
    observedAt: timestamp,
    evidenceReference: null,
    createdByUserId: userId,
    createdAt: timestamp,
  };
}
