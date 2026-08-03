import { createHash } from "node:crypto";

export type AttributionSubjectType = "LEAD" | "OPPORTUNITY";
export type AttributionEvidenceType = "CLICK_ID" | "EXPLICIT_CAMPAIGN_ID" | "UTM_CAMPAIGN_ID" | "MANUAL_CONFIRMED";
export type AttributionConfidence = "HIGH" | "MEDIUM";

export type AttributionEvidence = Readonly<{
  type: AttributionEvidenceType;
  value: string;
  provider: string;
  externalAccountId?: string;
  campaignId?: string;
}>;

export type AttributionCandidate = Readonly<{
  evidenceType: AttributionEvidenceType;
  evidenceHash: string;
  provider: string;
  externalAccountId: string | null;
  campaignId: string | null;
  confidence: AttributionConfidence;
}>;

export function deriveAttributionCandidate(evidence: AttributionEvidence): AttributionCandidate {
  const value = evidence.value.trim();
  if (!value) throw new Error("Attribution evidence value is required.");
  const confidence: AttributionConfidence = evidence.type === "UTM_CAMPAIGN_ID" ? "MEDIUM" : "HIGH";
  return {
    evidenceType: evidence.type,
    evidenceHash: createHash("sha256").update(`${evidence.type}|${value}`).digest("hex"),
    provider: evidence.provider.trim().toUpperCase(),
    externalAccountId: evidence.externalAccountId?.trim() || null,
    campaignId: evidence.campaignId?.trim() || null,
    confidence,
  };
}

export function supportsAutomaticAttribution(input: Readonly<{
  clickId?: string | null;
  explicitCampaignId?: string | null;
  utmCampaignId?: string | null;
}>): boolean {
  return Boolean(input.clickId?.trim() || input.explicitCampaignId?.trim() || input.utmCampaignId?.trim());
}

export function rejectTemporalOnlyAttribution(): never {
  throw new Error("Temporal proximity alone is not sufficient attribution evidence.");
}
