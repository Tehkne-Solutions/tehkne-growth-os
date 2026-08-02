import { createHash } from "node:crypto";

import type { ConnectorProvider } from "./types";

export const canonicalPaidMediaMetricIds = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "conversions",
] as const;

export type CanonicalPaidMediaMetricId = (typeof canonicalPaidMediaMetricIds)[number];

export type CanonicalCampaignPerformance = Readonly<{
  provider: ConnectorProvider;
  externalAccountId: string;
  campaignId: string;
  campaignName: string;
  date: string;
  currency?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
}>;

export type CanonicalMetricObservationInput = Readonly<{
  workspaceId: string;
  metricId: CanonicalPaidMediaMetricId;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  currency?: string;
  source: string;
  sourceKey: string;
  dimensions: Readonly<Record<string, string>>;
}>;

export function expandCampaignPerformanceToMetricObservations(
  workspaceId: string,
  record: CanonicalCampaignPerformance,
): readonly CanonicalMetricObservationInput[] {
  const periodStart = parseUtcDate(record.date);
  const periodEnd = new Date(periodStart);
  const dimensions = {
    provider: record.provider,
    external_account_id: record.externalAccountId,
    campaign_id: record.campaignId,
    campaign_name: record.campaignName,
  } as const;
  const values: readonly [CanonicalPaidMediaMetricId, number, boolean][] = [
    ["spend", record.spend, true],
    ["impressions", record.impressions, false],
    ["clicks", record.clicks, false],
    ["ctr", record.ctr, false],
    ["cpc", record.cpc, true],
    ["conversions", record.conversions, false],
  ];

  return values.map(([metricId, value, monetary]) => ({
    workspaceId,
    metricId,
    periodStart,
    periodEnd,
    value,
    ...(monetary && record.currency ? { currency: record.currency } : {}),
    source: record.provider === "GOOGLE_ADS" ? "google_ads" : "meta_ads",
    sourceKey: providerMetricSourceKey({ workspaceId, record, metricId }),
    dimensions,
  }));
}

export function providerMetricSourceKey(input: Readonly<{
  workspaceId: string;
  record: Pick<CanonicalCampaignPerformance, "provider" | "externalAccountId" | "campaignId" | "date">;
  metricId: CanonicalPaidMediaMetricId;
}>): string {
  return createHash("sha256")
    .update(input.workspaceId)
    .update("\0")
    .update(input.record.provider)
    .update("\0")
    .update(input.record.externalAccountId)
    .update("\0")
    .update(input.record.campaignId)
    .update("\0")
    .update(input.record.date)
    .update("\0")
    .update(input.metricId)
    .digest("hex");
}

function parseUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid provider date: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid provider date: ${value}`);
  return parsed;
}
