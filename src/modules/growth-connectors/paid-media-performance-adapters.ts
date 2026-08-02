import { parseTokenBundle, ProviderAccessVerificationError } from "./provider-adapters";
import type { CanonicalCampaignPerformance } from "./performance-normalization";
import type { SecretProvider } from "./secret-provider";

export type PerformanceReadContext = Readonly<{
  externalAccountId: string;
  tokenSecretRef: string;
  secrets: SecretProvider;
  startDate: string;
  endDate: string;
}>;

export interface PaidMediaPerformanceReader {
  readCampaignDailyPerformance(context: PerformanceReadContext): Promise<readonly CanonicalCampaignPerformance[]>;
}

type FetchLike = typeof fetch;

export class GoogleAdsPerformanceReader implements PaidMediaPerformanceReader {
  constructor(private readonly options: Readonly<{
    apiVersion: string;
    developerTokenSecretRef: string;
    fetcher?: FetchLike;
  }>) {
    if (!/^v\d+$/.test(options.apiVersion)) throw new Error("Google Ads API version must be explicit.");
  }

  async readCampaignDailyPerformance(context: PerformanceReadContext): Promise<readonly CanonicalCampaignPerformance[]> {
    const token = await requireAccessToken(context.secrets, context.tokenSecretRef, "Google Ads");
    const developerTokenPayload = await context.secrets.get(this.options.developerTokenSecretRef);
    const developerToken = developerTokenPayload?.developerToken;
    if (!developerToken) throw new ProviderAccessVerificationError("Google Ads developer token is unavailable.");

    const customerId = context.externalAccountId.replace(/-/g, "");
    const query = [
      "SELECT campaign.id, campaign.name, segments.date, customer.currency_code,",
      "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions",
      "FROM campaign",
      `WHERE segments.date BETWEEN '${assertDate(context.startDate)}' AND '${assertDate(context.endDate)}'`,
      "AND campaign.status != 'REMOVED'",
    ].join(" ");
    const response = await (this.options.fetcher ?? fetch)(
      `https://googleads.googleapis.com/${this.options.apiVersion}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "developer-token": developerToken,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );
    if (!response.ok) throw new ProviderAccessVerificationError(`Google Ads performance query failed with HTTP ${response.status}.`);
    const chunks = await response.json() as Array<{ results?: GoogleAdsRow[] }>;
    return chunks.flatMap((chunk) => chunk.results ?? []).map((row) => ({
      provider: "GOOGLE_ADS" as const,
      externalAccountId: customerId,
      campaignId: row.campaign?.id ?? "unknown",
      campaignName: row.campaign?.name ?? row.campaign?.id ?? "Unknown campaign",
      date: row.segments?.date ?? context.startDate,
      ...(row.customer?.currencyCode ? { currency: row.customer.currencyCode } : {}),
      spend: microsToUnit(row.metrics?.costMicros),
      impressions: toNumber(row.metrics?.impressions),
      clicks: toNumber(row.metrics?.clicks),
      conversions: toNumber(row.metrics?.conversions),
    }));
  }
}

type GoogleAdsRow = {
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  customer?: { currencyCode?: string };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: string | number };
};

export class MetaAdsPerformanceReader implements PaidMediaPerformanceReader {
  constructor(private readonly options: Readonly<{ apiVersion: string; fetcher?: FetchLike }>) {
    if (!/^v\d+\.\d+$/.test(options.apiVersion)) throw new Error("Meta Graph API version must be explicit.");
  }

  async readCampaignDailyPerformance(context: PerformanceReadContext): Promise<readonly CanonicalCampaignPerformance[]> {
    const token = await requireAccessToken(context.secrets, context.tokenSecretRef, "Meta Ads");
    const accountId = context.externalAccountId.startsWith("act_")
      ? context.externalAccountId
      : `act_${context.externalAccountId}`;
    const url = new URL(`https://graph.facebook.com/${this.options.apiVersion}/${accountId}/insights`);
    url.searchParams.set("level", "campaign");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("fields", "campaign_id,campaign_name,date_start,spend,impressions,clicks,account_currency");
    url.searchParams.set("time_range", JSON.stringify({ since: assertDate(context.startDate), until: assertDate(context.endDate) }));
    url.searchParams.set("limit", "500");

    const rows: MetaInsightsRow[] = [];
    let nextUrl: string | null = url.toString();
    while (nextUrl) {
      const response = await (this.options.fetcher ?? fetch)(nextUrl, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!response.ok) throw new ProviderAccessVerificationError(`Meta Ads insights query failed with HTTP ${response.status}.`);
      const body = await response.json() as { data?: MetaInsightsRow[]; paging?: { next?: string } };
      rows.push(...(body.data ?? []));
      nextUrl = body.paging?.next ?? null;
    }

    return rows.map((row) => ({
      provider: "META_ADS" as const,
      externalAccountId: accountId,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name ?? row.campaign_id,
      date: row.date_start,
      ...(row.account_currency ? { currency: row.account_currency } : {}),
      spend: toNumber(row.spend),
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
    }));
  }
}

type MetaInsightsRow = {
  campaign_id: string;
  campaign_name?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  account_currency?: string;
};

async function requireAccessToken(secrets: SecretProvider, tokenSecretRef: string, provider: string): Promise<string> {
  const bundle = parseTokenBundle(await secrets.get(tokenSecretRef));
  if (!bundle?.accessToken) throw new ProviderAccessVerificationError(`${provider} access token is unavailable.`);
  return bundle.accessToken;
}

function microsToUnit(value: string | number | undefined): number {
  return toNumber(value) / 1_000_000;
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid provider date: ${value}`);
  return value;
}
