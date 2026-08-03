import { buildLeadIdentityHash } from "./identity";
import type {
  CanonicalCrmLead,
  CanonicalCrmOpportunity,
  CrmReadPage,
  ReadOnlyCrmAdapter,
} from "./types";

export class HubSpotCrmReadError extends Error {}

export class HubSpotCrmAdapter implements ReadOnlyCrmAdapter {
  readonly provider = "HUBSPOT" as const;

  constructor(
    private readonly config: Readonly<{
      apiBaseUrl?: string;
      apiPath?: string;
      fetchImpl?: typeof fetch;
    }> = {},
  ) {}

  async readPage(input: Readonly<{
    accessToken: string;
    cursor: string | null;
    updatedAfter: Date | null;
    limit: number;
  }>): Promise<CrmReadPage> {
    const cursor = parseCursor(input.cursor);
    if (cursor.phase === "contacts") {
      const page = await this.search("contacts", cursor.after, input.updatedAfter, input.limit, input.accessToken);
      const leads = page.results.map(mapContact);
      const nextCursor = page.nextAfter
        ? formatCursor("contacts", page.nextAfter)
        : formatCursor("deals", null);
      return {
        leads,
        opportunities: [],
        nextCursor,
        watermark: maxDate(leads.map((lead) => lead.updatedAt)),
      };
    }

    const page = await this.search("deals", cursor.after, input.updatedAfter, input.limit, input.accessToken);
    const opportunities = page.results.map(mapDeal);
    return {
      leads: [],
      opportunities,
      nextCursor: page.nextAfter ? formatCursor("deals", page.nextAfter) : null,
      watermark: maxDate(opportunities.map((opportunity) => opportunity.updatedAt)),
    };
  }

  private async search(
    objectType: "contacts" | "deals",
    after: string | null,
    updatedAfter: Date | null,
    limit: number,
    accessToken: string,
  ): Promise<Readonly<{ results: HubSpotObject[]; nextAfter: string | null }>> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const baseUrl = this.config.apiBaseUrl ?? "https://api.hubapi.com";
    const apiPath = this.config.apiPath ?? "/crm/v3";
    const modifiedProperty = objectType === "contacts" ? "lastmodifieddate" : "hs_lastmodifieddate";
    const properties = objectType === "contacts"
      ? ["email", "phone", "lifecyclestage", "createdate", "lastmodifieddate"]
      : ["pipeline", "dealstage", "amount", "deal_currency_code", "createdate", "hs_lastmodifieddate", "closedate", "hs_is_closed", "hs_is_closed_won"];

    const body = {
      limit: Math.min(Math.max(Math.trunc(limit), 1), 200),
      properties,
      sorts: [modifiedProperty],
      ...(after ? { after } : {}),
      ...(updatedAfter
        ? {
            filterGroups: [{
              filters: [{
                propertyName: modifiedProperty,
                operator: "GT",
                value: String(updatedAfter.getTime()),
              }],
            }],
          }
        : {}),
    };

    const response = await fetchImpl(`${baseUrl}${apiPath}/objects/${objectType}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new HubSpotCrmReadError(`HubSpot ${objectType} search failed with HTTP ${response.status}.`);
    }
    const payload = await response.json() as HubSpotSearchResponse;
    return {
      results: Array.isArray(payload.results) ? payload.results : [],
      nextAfter: payload.paging?.next?.after ?? null,
    };
  }
}

type HubSpotObject = Readonly<{
  id: string;
  properties?: Readonly<Record<string, string | null>>;
  createdAt?: string;
  updatedAt?: string;
}>;

type HubSpotSearchResponse = Readonly<{
  results?: readonly HubSpotObject[];
  paging?: Readonly<{ next?: Readonly<{ after?: string }> }>;
}>;

function mapContact(object: HubSpotObject): CanonicalCrmLead {
  const properties = object.properties ?? {};
  return {
    provider: "HUBSPOT",
    externalId: object.id,
    identityHash: buildLeadIdentityHash({ email: properties.email, phone: properties.phone }),
    lifecycleStage: properties.lifecyclestage ?? null,
    createdAt: parseDate(properties.createdate ?? object.createdAt),
    updatedAt: parseDate(properties.lastmodifieddate ?? object.updatedAt),
    properties: {},
  };
}

function mapDeal(object: HubSpotObject): CanonicalCrmOpportunity {
  const properties = object.properties ?? {};
  const amount = parseNumber(properties.amount);
  const won = parseBoolean(properties.hs_is_closed_won);
  const closed = parseBoolean(properties.hs_is_closed);
  return {
    provider: "HUBSPOT",
    externalId: object.id,
    primaryLeadExternalId: null,
    pipelineId: properties.pipeline ?? null,
    stageId: properties.dealstage ?? null,
    amount,
    currency: normalizeCurrency(properties.deal_currency_code),
    status: won ? "WON" : closed ? "LOST" : "OPEN",
    createdAt: parseDate(properties.createdate ?? object.createdAt),
    updatedAt: parseDate(properties.hs_lastmodifieddate ?? object.updatedAt),
    closedAt: parseDate(properties.closedate),
    properties: {},
  };
}

function parseCursor(value: string | null): Readonly<{ phase: "contacts" | "deals"; after: string | null }> {
  if (!value) return { phase: "contacts", after: null };
  const separator = value.indexOf(":");
  if (separator < 0) return { phase: "contacts", after: value };
  const phase = value.slice(0, separator) === "deals" ? "deals" : "contacts";
  const after = value.slice(separator + 1) || null;
  return { phase, after };
}

function formatCursor(phase: "contacts" | "deals", after: string | null): string {
  return `${phase}:${after ?? ""}`;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value?: string | null): boolean {
  return value === "true" || value === "1";
}

function normalizeCurrency(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function maxDate(values: readonly (Date | null)[]): Date | null {
  const timestamps = values.flatMap((value) => value ? [value.getTime()] : []);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}
