export type CrmProvider = "HUBSPOT";
export type CrmConnectionStatus = "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";
export type CrmOpportunityStatus = "OPEN" | "WON" | "LOST";

export type HubSpotAttributionPropertyMap = Readonly<{
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  utmCampaign?: string;
  utmSource?: string;
  googleCampaignId?: string;
  metaCampaignId?: string;
}>;

export type CrmConnectionSettings = Readonly<{
  attributionProperties?: HubSpotAttributionPropertyMap;
}>;

export type CanonicalCrmAttributionEvidence = Readonly<{
  type: "CLICK_ID" | "EXPLICIT_CAMPAIGN_ID" | "UTM_CAMPAIGN_ID";
  value: string;
  provider: "GOOGLE_ADS" | "META_ADS" | "UNKNOWN";
  externalAccountId?: string;
  campaignId?: string;
}>;

export type CrmConnection = Readonly<{
  id: string;
  workspaceId: string;
  provider: CrmProvider;
  externalAccountId: string;
  displayName: string;
  status: CrmConnectionStatus;
  secretRef: string | null;
  settings?: CrmConnectionSettings;
  cursor: string | null;
  watermark: Date | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  consecutiveFailures: number;
}>;

export type CanonicalCrmLead = Readonly<{
  provider: CrmProvider;
  externalId: string;
  identityHash: string | null;
  lifecycleStage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  attributionEvidence?: readonly CanonicalCrmAttributionEvidence[];
  properties: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CanonicalCrmOpportunity = Readonly<{
  provider: CrmProvider;
  externalId: string;
  primaryLeadExternalId: string | null;
  pipelineId: string | null;
  stageId: string | null;
  amount: number | null;
  currency: string | null;
  status: CrmOpportunityStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
  closedAt: Date | null;
  properties: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CrmReadPage = Readonly<{
  leads: readonly CanonicalCrmLead[];
  opportunities: readonly CanonicalCrmOpportunity[];
  nextCursor: string | null;
  watermark: Date | null;
}>;

export interface ReadOnlyCrmAdapter {
  provider: CrmProvider;
  readPage(input: Readonly<{
    accessToken: string;
    cursor: string | null;
    updatedAfter: Date | null;
    limit: number;
  }>): Promise<CrmReadPage>;
}
