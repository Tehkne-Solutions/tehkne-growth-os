import { randomUUID } from "node:crypto";

import type { CanonicalCrmAttributionEvidence } from "@/modules/growth-crm/types";
import type { DatabaseClient } from "@/shared/db/client";

import { deriveAttributionCandidate } from "./foundation";

export async function persistLeadAttributionEvidence(
  database: DatabaseClient,
  input: Readonly<{
    workspaceId: string;
    leadId: string;
    observedAt: Date;
    evidence: readonly CanonicalCrmAttributionEvidence[];
  }>,
): Promise<number> {
  let written = 0;
  for (const evidence of input.evidence) {
    const candidate = deriveAttributionCandidate(evidence);
    written += await database.$executeRaw`
      INSERT INTO growth_attribution_links (
        id, workspace_id, subject_type, subject_id, provider,
        external_account_id, campaign_id, evidence_type, evidence_hash,
        confidence, status, observed_at
      ) VALUES (
        ${randomUUID()}::uuid, ${input.workspaceId}::uuid, 'LEAD', ${input.leadId}::uuid,
        ${candidate.provider}, ${candidate.externalAccountId}, ${candidate.campaignId},
        ${candidate.evidenceType}, ${candidate.evidenceHash}, ${candidate.confidence},
        'OBSERVED', ${input.observedAt}
      )
      ON CONFLICT (workspace_id, subject_type, subject_id, evidence_type, evidence_hash)
      DO NOTHING
    `;
  }
  return written;
}

export async function materializeAttributedCampaignRevenue(
  database: DatabaseClient,
  input: Readonly<{
    workspaceId: string;
    from: Date;
    to: Date;
  }>,
): Promise<Readonly<{ campaigns: number; attributedLeads: number; attributedWonDeals: number; attributedRevenue: number }>> {
  const rows = await database.$queryRaw<Array<{
    provider: string;
    externalAccountId: string | null;
    campaignId: string;
    currency: string | null;
    attributedLeads: number;
    attributedWonDeals: number;
    attributedRevenue: number;
    highCount: number;
    mediumCount: number;
  }>>`
    WITH accepted_links AS (
      SELECT DISTINCT ON (subject_id)
        subject_id, provider, external_account_id, campaign_id, confidence
      FROM growth_attribution_links
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND subject_type = 'LEAD'
        AND status IN ('OBSERVED','CONFIRMED')
        AND campaign_id IS NOT NULL
      ORDER BY subject_id, CASE confidence WHEN 'HIGH' THEN 0 ELSE 1 END, observed_at DESC
    ), lead_rollup AS (
      SELECT
        al.provider,
        al.external_account_id,
        al.campaign_id,
        COUNT(DISTINCT l.id)::int AS attributed_leads,
        COUNT(*) FILTER (WHERE al.confidence = 'HIGH')::int AS high_count,
        COUNT(*) FILTER (WHERE al.confidence = 'MEDIUM')::int AS medium_count
      FROM accepted_links al
      JOIN growth_crm_leads l ON l.id = al.subject_id
      WHERE l.workspace_id = ${input.workspaceId}::uuid
        AND COALESCE(l.created_at_source, l.created_at) BETWEEN ${input.from} AND ${input.to}
      GROUP BY al.provider, al.external_account_id, al.campaign_id
    ), revenue_rollup AS (
      SELECT
        al.provider,
        al.external_account_id,
        al.campaign_id,
        o.currency,
        COUNT(DISTINCT o.id)::int AS attributed_won_deals,
        COALESCE(SUM(o.amount), 0)::double precision AS attributed_revenue
      FROM accepted_links al
      JOIN growth_crm_opportunities o ON o.primary_lead_id = al.subject_id
      WHERE o.workspace_id = ${input.workspaceId}::uuid
        AND o.status = 'WON'
        AND COALESCE(o.closed_at, o.updated_at_source, o.updated_at) BETWEEN ${input.from} AND ${input.to}
      GROUP BY al.provider, al.external_account_id, al.campaign_id, o.currency
    )
    SELECT
      l.provider,
      l.external_account_id AS "externalAccountId",
      l.campaign_id AS "campaignId",
      r.currency,
      l.attributed_leads AS "attributedLeads",
      COALESCE(r.attributed_won_deals, 0)::int AS "attributedWonDeals",
      COALESCE(r.attributed_revenue, 0)::double precision AS "attributedRevenue",
      l.high_count AS "highCount",
      l.medium_count AS "mediumCount"
    FROM lead_rollup l
    LEFT JOIN revenue_rollup r
      ON r.provider = l.provider
      AND r.campaign_id = l.campaign_id
      AND r.external_account_id IS NOT DISTINCT FROM l.external_account_id
  `;

  for (const row of rows) {
    const spendRows = await database.$queryRaw<Array<{ spend: number }>>`
      SELECT COALESCE(SUM(value), 0)::double precision AS spend
      FROM metric_observations
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND metric_id = 'spend'
        AND period_start >= ${input.from}
        AND period_end <= ${input.to}
        AND dimensions->>'provider' = ${row.provider}
        AND dimensions->>'campaign_id' = ${row.campaignId}
        AND (${row.externalAccountId}::text IS NULL OR dimensions->>'external_account_id' = ${row.externalAccountId})
        AND (${row.currency}::text IS NULL OR currency = ${row.currency})
    `;
    const spend = spendRows[0]?.spend ?? 0;
    const roas = spend > 0 ? row.attributedRevenue / spend : null;
    await database.$executeRaw`
      INSERT INTO growth_attribution_campaign_metrics (
        id, workspace_id, provider, external_account_id, campaign_id,
        period_start, period_end, currency, attributed_leads,
        attributed_won_deals, attributed_revenue, media_spend, attributed_roas,
        confidence_high_count, confidence_medium_count, calculated_at
      ) VALUES (
        ${randomUUID()}::uuid, ${input.workspaceId}::uuid, ${row.provider},
        ${row.externalAccountId}, ${row.campaignId}, ${input.from}, ${input.to}, ${row.currency},
        ${row.attributedLeads}, ${row.attributedWonDeals}, ${row.attributedRevenue},
        ${spend}, ${roas}, ${row.highCount}, ${row.mediumCount}, NOW()
      )
      ON CONFLICT (workspace_id, provider, external_account_id, campaign_id, period_start, period_end, currency)
      DO UPDATE SET
        attributed_leads = EXCLUDED.attributed_leads,
        attributed_won_deals = EXCLUDED.attributed_won_deals,
        attributed_revenue = EXCLUDED.attributed_revenue,
        media_spend = EXCLUDED.media_spend,
        attributed_roas = EXCLUDED.attributed_roas,
        confidence_high_count = EXCLUDED.confidence_high_count,
        confidence_medium_count = EXCLUDED.confidence_medium_count,
        calculated_at = NOW(),
        updated_at = NOW()
    `;
  }

  return {
    campaigns: rows.length,
    attributedLeads: rows.reduce((sum, row) => sum + row.attributedLeads, 0),
    attributedWonDeals: rows.reduce((sum, row) => sum + row.attributedWonDeals, 0),
    attributedRevenue: rows.reduce((sum, row) => sum + row.attributedRevenue, 0),
  };
}

export async function loadAttributionCoverage(
  database: DatabaseClient,
  input: Readonly<{ workspaceId: string; from: Date; to: Date }>,
): Promise<Readonly<{ totalLeads: number; attributedLeads: number; coveragePercent: number | null }>> {
  const rows = await database.$queryRaw<Array<{ totalLeads: number; attributedLeads: number }>>`
    SELECT
      COUNT(DISTINCT l.id)::int AS "totalLeads",
      COUNT(DISTINCT a.subject_id)::int AS "attributedLeads"
    FROM growth_crm_leads l
    LEFT JOIN growth_attribution_links a
      ON a.workspace_id = l.workspace_id
      AND a.subject_type = 'LEAD'
      AND a.subject_id = l.id
      AND a.status IN ('OBSERVED','CONFIRMED')
      AND a.campaign_id IS NOT NULL
    WHERE l.workspace_id = ${input.workspaceId}::uuid
      AND COALESCE(l.created_at_source, l.created_at) BETWEEN ${input.from} AND ${input.to}
  `;
  const totalLeads = rows[0]?.totalLeads ?? 0;
  const attributedLeads = rows[0]?.attributedLeads ?? 0;
  return { totalLeads, attributedLeads, coveragePercent: totalLeads > 0 ? (attributedLeads / totalLeads) * 100 : null };
}
