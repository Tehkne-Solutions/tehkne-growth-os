import { describe, expect, it } from "vitest";

import {
  deriveAttributionCandidate,
  rejectTemporalOnlyAttribution,
  supportsAutomaticAttribution,
} from "@/modules/growth-attribution/foundation";

describe("growth attribution foundation", () => {
  it("assigns high confidence to explicit click evidence without storing the raw value", () => {
    const candidate = deriveAttributionCandidate({
      type: "CLICK_ID",
      value: "synthetic-click-marker",
      provider: "google_ads",
      campaignId: "123",
    });
    expect(candidate.confidence).toBe("HIGH");
    expect(candidate.provider).toBe("GOOGLE_ADS");
    expect(candidate.evidenceHash).toHaveLength(64);
    expect(candidate.evidenceHash).not.toContain("synthetic-click-marker");
  });

  it("classifies UTM campaign evidence as medium confidence", () => {
    expect(deriveAttributionCandidate({
      type: "UTM_CAMPAIGN_ID",
      value: "campaign-a",
      provider: "meta_ads",
      campaignId: "campaign-a",
    }).confidence).toBe("MEDIUM");
  });

  it("does not support temporal-only automatic attribution", () => {
    expect(supportsAutomaticAttribution({})).toBe(false);
    expect(() => rejectTemporalOnlyAttribution()).toThrow(/Temporal proximity/);
  });
});
