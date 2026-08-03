import { createHash, randomUUID } from "node:crypto";

import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { DatabaseClient } from "@/shared/db/client";

export const fullFunnelMetricIds = [
  "leads",
  "qualified_leads",
  "opportunities",
  "won_deals",
  "revenue",
  "cpl",
  "cpa",
  "roas",
] as const;

export type FullFunnelMetricId = (typeof fullFunnelMetricIds)[number];

export async function materializeFullFunnelMetrics(input: Readonly<{
  database: DatabaseClient;
  workspaceId: string;
  sectorPack: SectorPackManifest;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  qualifiedStages?: ReadonlySet<string>;
}>): Promise<Readonly<{ written: number; values: Readonly<Partial<Record<FullFunnelMetricId, number>>> }>> {
  if (input.periodEnd <= input.periodStart) throw new Error("Full-funnel metric period must be positive.");
  const currency = normalizeCurrency(input.currency);
  const declared = new Set(input.sectorPack.metrics.map((metric) => metric.id));

  const [leadRows, opportunityRows, wonRows, revenueRows, spendRows] = await Promise.all([
    input.database.$queryRaw<Array<{ value: bigint }>>`
      SELECT COUNT(*)::bigint AS value
      FROM growth_crm_leads
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND created_at_source >= ${input.periodStart}
        AND created_at_source < ${input.periodEnd}
    `,
    input.database.$queryRaw<Array<{ value: bigint }>>`
      SELECT COUNT(*)::bigint AS value
      FROM growth_crm_funnel_events
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND event_type = 'crm_opportunity_created'
        AND occurred_at >= ${input.periodStart}
        AND occurred_at < ${input.periodEnd}
    `,
    input.database.$queryRaw<Array<{ value: bigint }>>`
      SELECT COUNT(*)::bigint AS value
      FROM growth_crm_funnel_events
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND event_type = 'crm_opportunity_won'
        AND occurred_at >= ${input.periodStart}
        AND occurred_at < ${input.periodEnd}
    `,
    input.database.$queryRaw<Array<{ value: string | number | null }>>`
      SELECT COALESCE(SUM(amount), 0) AS value
      FROM growth_crm_opportunities
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND status = 'WON'
        AND currency = ${currency}
        AND closed_at >= ${input.periodStart}
        AND closed_at < ${input.periodEnd}
    `,
    input.database.$queryRaw<Array<{ value: string | number | null }>>`
      SELECT COALESCE(SUM(value), 0) AS value
      FROM metric_observations
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND metric_id = 'spend'
        AND currency = ${currency}
        AND period_start >= ${input.periodStart}
        AND period_end <= ${input.periodEnd}
    `,
  ]);

  const leads = Number(leadRows[0]?.value ?? 0n);
  const opportunities = Number(opportunityRows[0]?.value ?? 0n);
  const wonDeals = Number(wonRows[0]?.value ?? 0n);
  const revenue = Number(revenueRows[0]?.value ?? 0);
  const spend = Number(spendRows[0]?.value ?? 0);
  const qualifiedLeads = await countQualifiedLeads(input);

  const values: Partial<Record<FullFunnelMetricId, number>> = {
    leads,
    opportunities,
    won_deals: wonDeals,
    revenue,
    ...(qualifiedLeads === null ? {} : { qualified_leads: qualifiedLeads }),
    ...(leads > 0 ? { cpl: spend / leads } : {}),
    ...(wonDeals > 0 ? { cpa: spend / wonDeals } : {}),
    ...(spend > 0 ? { roas: revenue / spend } : {}),
  };

  let written = 0;
  for (const metricId of fullFunnelMetricIds) {
    if (!declared.has(metricId)) continue;
    const value = values[metricId];
    if (value === undefined || !Number.isFinite(value)) continue;
    const metricCurrency = ["revenue", "cpl", "cpa"].includes(metricId) ? currency : null;
    const sourceKey = sha256([
      "crm-full-funnel",
      input.workspaceId,
      input.sectorPack.id,
      input.sectorPack.version,
      metricId,
      input.periodStart.toISOString(),
      input.periodEnd.toISOString(),
      metricCurrency ?? "",
    ].join("|"));
    const result = await input.database.$executeRaw`
      INSERT INTO metric_observations (
        id, workspace_id, metric_id, period_start, period_end, value, currency,
        source, dimensions, source_key
      ) VALUES (
        ${randomUUID()}::uuid, ${input.workspaceId}::uuid, ${metricId}, ${input.periodStart}, ${input.periodEnd},
        ${value}, ${metricCurrency}, 'crm_full_funnel',
        ${JSON.stringify({ sectorPackId: input.sectorPack.id, sectorPackVersion: input.sectorPack.version })}::jsonb,
        ${sourceKey}
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET
        value = EXCLUDED.value,
        currency = EXCLUDED.currency,
        dimensions = EXCLUDED.dimensions
    `;
    written += result;
  }

  return { written, values };
}

async function countQualifiedLeads(input: Readonly<{
  database: DatabaseClient;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  qualifiedStages?: ReadonlySet<string>;
}>): Promise<number | null> {
  const stages = [...(input.qualifiedStages ?? [])];
  if (stages.length === 0) return null;
  const rows = await input.database.$queryRaw<Array<{ value: bigint }>>`
    SELECT COUNT(DISTINCT subject_id)::bigint AS value
    FROM growth_crm_funnel_events
    WHERE workspace_id = ${input.workspaceId}::uuid
      AND subject_type = 'LEAD'
      AND stage_id = ANY(${stages}::text[])
      AND occurred_at >= ${input.periodStart}
      AND occurred_at < ${input.periodEnd}
  `;
  return Number(rows[0]?.value ?? 0n);
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Full-funnel metrics require a 3-letter currency code.");
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
