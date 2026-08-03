import type { DatabaseClient } from "@/shared/db/client";

import type { CrmConnection } from "./types";

export class HubSpotAssociationReadError extends Error {}

export async function resolveHubSpotDealContactAssociations(input: Readonly<{
  database: DatabaseClient;
  connection: CrmConnection;
  accessToken: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
  associationPath?: string;
  batchSize?: number;
}>): Promise<Readonly<{ dealsRead: number; linked: number }>> {
  if (input.connection.provider !== "HUBSPOT") return { dealsRead: 0, linked: 0 };

  const deals = await input.database.$queryRaw<Array<{ id: string; externalId: string }>>`
    SELECT id, external_id AS "externalId"
    FROM growth_crm_opportunities
    WHERE workspace_id = ${input.connection.workspaceId}::uuid
      AND connection_id = ${input.connection.id}::uuid
      AND primary_lead_id IS NULL
    ORDER BY updated_at_source DESC NULLS LAST
    LIMIT 5000
  `;
  if (deals.length === 0) return { dealsRead: 0, linked: 0 };

  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.apiBaseUrl ?? "https://api.hubapi.com";
  const path = input.associationPath ?? "/crm/v4/associations/deals/contacts/batch/read";
  const batchSize = Math.min(Math.max(input.batchSize ?? 500, 1), 1000);
  let linked = 0;

  for (let offset = 0; offset < deals.length; offset += batchSize) {
    const batch = deals.slice(offset, offset + batchSize);
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: batch.map((deal) => ({ id: deal.externalId })) }),
    });
    if (!response.ok) {
      throw new HubSpotAssociationReadError(`HubSpot association batch read failed with HTTP ${response.status}.`);
    }
    const payload = await response.json() as HubSpotAssociationResponse;
    for (const result of payload.results ?? []) {
      const contactExternalId = result.to?.[0]?.toObjectId ?? null;
      if (!contactExternalId) continue;
      const leadRows = await input.database.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM growth_crm_leads
        WHERE workspace_id = ${input.connection.workspaceId}::uuid
          AND provider = 'HUBSPOT'
          AND external_id = ${contactExternalId}
        LIMIT 1
      `;
      const leadId = leadRows[0]?.id;
      if (!leadId) continue;
      const updated = await input.database.$executeRaw`
        UPDATE growth_crm_opportunities
        SET primary_lead_id = ${leadId}::uuid, updated_at = NOW()
        WHERE workspace_id = ${input.connection.workspaceId}::uuid
          AND connection_id = ${input.connection.id}::uuid
          AND external_id = ${result.from.id}
          AND primary_lead_id IS NULL
      `;
      linked += updated;
    }
  }

  return { dealsRead: deals.length, linked };
}

type HubSpotAssociationResponse = Readonly<{
  results?: readonly Readonly<{
    from: Readonly<{ id: string }>;
    to?: readonly Readonly<{ toObjectId: string }> [];
  }>[];
}>;
