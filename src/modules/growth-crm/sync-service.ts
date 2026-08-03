import { createHash, randomUUID } from "node:crypto";

import { persistLeadAttributionEvidence } from "@/modules/growth-attribution/capture";
import type { SecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { DatabaseClient } from "@/shared/db/client";

import type {
  CanonicalCrmLead,
  CanonicalCrmOpportunity,
  CrmConnection,
  ReadOnlyCrmAdapter,
} from "./types";

export type CrmSyncResult = Readonly<{
  leadsUpserted: number;
  opportunitiesUpserted: number;
  attributionLinksWritten: number;
  funnelEventsWritten: number;
  growthEventsProjected: number;
  pagesRead: number;
  cursor: string | null;
  watermark: Date | null;
}>;

export async function syncCrmFunnel(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    adapter: ReadOnlyCrmAdapter;
  }>,
  input: Readonly<{
    connection: CrmConnection;
    sectorPack: Readonly<{ id: string; version: string; eventTypes: ReadonlySet<string> }>;
    now?: Date;
    pageLimit?: number;
    maxPages?: number;
  }>,
): Promise<CrmSyncResult> {
  if (input.connection.status !== "ACTIVE") throw new Error("Only ACTIVE CRM connections can be synchronized.");
  if (!input.connection.secretRef) throw new Error("CRM connection has no secret reference.");
  const secret = await dependencies.secrets.get(input.connection.secretRef);
  const accessToken = secret?.accessToken;
  if (!accessToken) throw new Error("CRM connection token bundle is unavailable.");

  const now = input.now ?? new Date();
  const pageLimit = input.pageLimit ?? 100;
  const maxPages = input.maxPages ?? 50;
  let cursor = input.connection.cursor;
  let watermark = input.connection.watermark;
  let leadsUpserted = 0;
  let opportunitiesUpserted = 0;
  let attributionLinksWritten = 0;
  let funnelEventsWritten = 0;
  let growthEventsProjected = 0;
  let pagesRead = 0;

  await dependencies.database.$executeRaw`
    UPDATE growth_crm_connections
    SET last_attempt_at = ${now}, updated_at = NOW()
    WHERE id = ${input.connection.id}::uuid AND workspace_id = ${input.connection.workspaceId}::uuid
  `;

  try {
    do {
      const page = await dependencies.adapter.readPage({
        accessToken,
        cursor,
        updatedAfter: input.connection.watermark,
        limit: pageLimit,
      });
      pagesRead += 1;

      for (const lead of page.leads) {
        const result = await upsertLead(dependencies.database, input, lead);
        leadsUpserted += 1;
        funnelEventsWritten += result.funnelEvents;
        growthEventsProjected += result.growthEvents;
        if (lead.attributionEvidence.length > 0) {
          attributionLinksWritten += await persistLeadAttributionEvidence(dependencies.database, {
            workspaceId: input.connection.workspaceId,
            leadId: result.leadId,
            observedAt: lead.updatedAt ?? lead.createdAt ?? now,
            evidence: lead.attributionEvidence,
          });
        }
      }
      for (const opportunity of page.opportunities) {
        const result = await upsertOpportunity(dependencies.database, input, opportunity);
        opportunitiesUpserted += 1;
        funnelEventsWritten += result.funnelEvents;
        growthEventsProjected += result.growthEvents;
      }

      cursor = page.nextCursor;
      watermark = laterDate(watermark, page.watermark);
      if (!cursor || pagesRead >= maxPages) break;
    } while (true);

    await dependencies.database.$executeRaw`
      UPDATE growth_crm_connections SET
        cursor = ${cursor},
        watermark = ${watermark},
        last_success_at = ${now},
        last_attempt_at = ${now},
        consecutive_failures = 0,
        updated_at = NOW()
      WHERE id = ${input.connection.id}::uuid AND workspace_id = ${input.connection.workspaceId}::uuid
    `;
  } catch (error) {
    await dependencies.database.$executeRaw`
      UPDATE growth_crm_connections SET
        last_attempt_at = ${now},
        consecutive_failures = consecutive_failures + 1,
        status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'ERROR' ELSE status END,
        updated_at = NOW()
      WHERE id = ${input.connection.id}::uuid AND workspace_id = ${input.connection.workspaceId}::uuid
    `;
    throw error;
  }

  return {
    leadsUpserted,
    opportunitiesUpserted,
    attributionLinksWritten,
    funnelEventsWritten,
    growthEventsProjected,
    pagesRead,
    cursor,
    watermark,
  };
}

async function upsertLead(
  database: DatabaseClient,
  input: Parameters<typeof syncCrmFunnel>[1],
  lead: CanonicalCrmLead,
): Promise<Readonly<{ leadId: string; funnelEvents: number; growthEvents: number }>> {
  const existing = await database.$queryRaw<Array<{ id: string; lifecycleStage: string | null }>>`
    SELECT id, lifecycle_stage AS "lifecycleStage"
    FROM growth_crm_leads
    WHERE workspace_id = ${input.connection.workspaceId}::uuid
      AND provider = ${lead.provider}
      AND external_id = ${lead.externalId}
    LIMIT 1
  `;
  const leadId = existing[0]?.id ?? randomUUID();
  await database.$executeRaw`
    INSERT INTO growth_crm_leads (
      id, workspace_id, connection_id, provider, external_id, identity_hash,
      lifecycle_stage, created_at_source, updated_at_source, properties
    ) VALUES (
      ${leadId}::uuid, ${input.connection.workspaceId}::uuid, ${input.connection.id}::uuid,
      ${lead.provider}, ${lead.externalId}, ${lead.identityHash}, ${lead.lifecycleStage},
      ${lead.createdAt}, ${lead.updatedAt}, ${JSON.stringify(lead.properties)}::jsonb
    )
    ON CONFLICT (workspace_id, provider, external_id) DO UPDATE SET
      connection_id = EXCLUDED.connection_id,
      identity_hash = COALESCE(EXCLUDED.identity_hash, growth_crm_leads.identity_hash),
      lifecycle_stage = EXCLUDED.lifecycle_stage,
      created_at_source = COALESCE(growth_crm_leads.created_at_source, EXCLUDED.created_at_source),
      updated_at_source = EXCLUDED.updated_at_source,
      properties = EXCLUDED.properties,
      updated_at = NOW()
  `;

  const isNew = existing.length === 0;
  const stageChanged = !isNew && existing[0]?.lifecycleStage !== lead.lifecycleStage;
  if (!isNew && !stageChanged) return { leadId, funnelEvents: 0, growthEvents: 0 };
  const eventType = isNew ? "crm_lead_created" : "crm_lead_stage_changed";
  const occurredAt = lead.updatedAt ?? lead.createdAt ?? input.now ?? new Date();
  const event = await writeFunnelEvent(database, input, {
    subjectType: "LEAD",
    subjectId: leadId,
    externalId: lead.externalId,
    eventType,
    stageId: lead.lifecycleStage,
    occurredAt,
  });
  return { leadId, ...event };
}

async function upsertOpportunity(
  database: DatabaseClient,
  input: Parameters<typeof syncCrmFunnel>[1],
  opportunity: CanonicalCrmOpportunity,
): Promise<Readonly<{ funnelEvents: number; growthEvents: number }>> {
  const existing = await database.$queryRaw<Array<{ id: string; stageId: string | null; status: string }>>`
    SELECT id, stage_id AS "stageId", status
    FROM growth_crm_opportunities
    WHERE workspace_id = ${input.connection.workspaceId}::uuid
      AND provider = ${opportunity.provider}
      AND external_id = ${opportunity.externalId}
    LIMIT 1
  `;
  const opportunityId = existing[0]?.id ?? randomUUID();
  let primaryLeadId: string | null = null;
  if (opportunity.primaryLeadExternalId) {
    const leadRows = await database.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM growth_crm_leads
      WHERE workspace_id = ${input.connection.workspaceId}::uuid
        AND provider = ${opportunity.provider}
        AND external_id = ${opportunity.primaryLeadExternalId}
      LIMIT 1
    `;
    primaryLeadId = leadRows[0]?.id ?? null;
  }

  await database.$executeRaw`
    INSERT INTO growth_crm_opportunities (
      id, workspace_id, connection_id, provider, external_id, primary_lead_id,
      pipeline_id, stage_id, amount, currency, status, created_at_source,
      updated_at_source, closed_at, properties
    ) VALUES (
      ${opportunityId}::uuid, ${input.connection.workspaceId}::uuid, ${input.connection.id}::uuid,
      ${opportunity.provider}, ${opportunity.externalId}, ${primaryLeadId}::uuid,
      ${opportunity.pipelineId}, ${opportunity.stageId}, ${opportunity.amount}, ${opportunity.currency},
      ${opportunity.status}, ${opportunity.createdAt}, ${opportunity.updatedAt}, ${opportunity.closedAt},
      ${JSON.stringify(opportunity.properties)}::jsonb
    )
    ON CONFLICT (workspace_id, provider, external_id) DO UPDATE SET
      connection_id = EXCLUDED.connection_id,
      primary_lead_id = COALESCE(EXCLUDED.primary_lead_id, growth_crm_opportunities.primary_lead_id),
      pipeline_id = EXCLUDED.pipeline_id,
      stage_id = EXCLUDED.stage_id,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      created_at_source = COALESCE(growth_crm_opportunities.created_at_source, EXCLUDED.created_at_source),
      updated_at_source = EXCLUDED.updated_at_source,
      closed_at = EXCLUDED.closed_at,
      properties = EXCLUDED.properties,
      updated_at = NOW()
  `;

  const isNew = existing.length === 0;
  const statusChanged = !isNew && existing[0]?.status !== opportunity.status;
  const stageChanged = !isNew && existing[0]?.stageId !== opportunity.stageId;
  if (!isNew && !statusChanged && !stageChanged) return { funnelEvents: 0, growthEvents: 0 };
  const eventType = opportunity.status === "WON" && existing[0]?.status !== "WON"
    ? "crm_opportunity_won"
    : opportunity.status === "LOST" && existing[0]?.status !== "LOST"
      ? "crm_opportunity_lost"
      : isNew
        ? "crm_opportunity_created"
        : "crm_opportunity_stage_changed";
  const occurredAt = opportunity.closedAt ?? opportunity.updatedAt ?? opportunity.createdAt ?? input.now ?? new Date();
  return writeFunnelEvent(database, input, {
    subjectType: "OPPORTUNITY",
    subjectId: opportunityId,
    externalId: opportunity.externalId,
    eventType,
    stageId: opportunity.stageId,
    occurredAt,
  });
}

async function writeFunnelEvent(
  database: DatabaseClient,
  input: Parameters<typeof syncCrmFunnel>[1],
  event: Readonly<{
    subjectType: "LEAD" | "OPPORTUNITY";
    subjectId: string;
    externalId: string;
    eventType: string;
    stageId: string | null;
    occurredAt: Date;
  }>,
): Promise<Readonly<{ funnelEvents: number; growthEvents: number }>> {
  const deduplicationKey = sha256([
    input.connection.workspaceId,
    input.connection.provider,
    event.subjectType,
    event.externalId,
    event.eventType,
    event.stageId ?? "",
    event.occurredAt.toISOString(),
  ].join("|"));
  const inserted = await database.$queryRaw<Array<{ id: string }>>`
    INSERT INTO growth_crm_funnel_events (
      id, workspace_id, connection_id, subject_type, subject_id, event_type,
      stage_id, occurred_at, deduplication_key
    ) VALUES (
      ${randomUUID()}::uuid, ${input.connection.workspaceId}::uuid, ${input.connection.id}::uuid,
      ${event.subjectType}, ${event.subjectId}::uuid, ${event.eventType}, ${event.stageId},
      ${event.occurredAt}, ${deduplicationKey}
    )
    ON CONFLICT (deduplication_key) DO NOTHING
    RETURNING id
  `;
  if (inserted.length === 0) return { funnelEvents: 0, growthEvents: 0 };

  if (!input.sectorPack.eventTypes.has(event.eventType)) {
    return { funnelEvents: 1, growthEvents: 0 };
  }
  const growthDeduplicationKey = sha256(`crm-growth|${deduplicationKey}`);
  const projected = await database.$queryRaw<Array<{ id: string }>>`
    INSERT INTO growth_events (
      id, workspace_id, sector_pack_id, sector_pack_version, event_type,
      occurred_at, source, external_id, deduplication_key, properties
    ) VALUES (
      ${randomUUID()}::uuid, ${input.connection.workspaceId}::uuid, ${input.sectorPack.id},
      ${input.sectorPack.version}, ${event.eventType}, ${event.occurredAt}, 'crm',
      ${event.externalId}, ${growthDeduplicationKey},
      ${JSON.stringify({ provider: input.connection.provider, stageId: event.stageId, subjectType: event.subjectType })}::jsonb
    )
    ON CONFLICT (deduplication_key) DO NOTHING
    RETURNING id
  `;
  return { funnelEvents: 1, growthEvents: projected.length };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function laterDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}
