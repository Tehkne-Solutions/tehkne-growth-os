import { randomUUID } from "node:crypto";

import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { loadAttributionCoverage, materializeAttributedCampaignRevenue } from "./capture";

export const ATTRIBUTION_REVIEW_PERMISSION = "growth.attribution.review" as const;

export type AttributionCampaignIntelligence = Readonly<{
  provider: string;
  externalAccountId: string | null;
  campaignId: string;
  currency: string | null;
  attributedLeads: number;
  attributedWonDeals: number;
  attributedRevenue: number;
  mediaSpend: number;
  attributedRoas: number | null;
  confidenceHighCount: number;
  confidenceMediumCount: number;
  statusObservedCount: number;
  statusConfirmedCount: number;
  statusRejectedCount: number;
  calculatedAt: Date;
}>;

export type AttributionReviewItem = Readonly<{
  id: string;
  subjectType: "LEAD" | "OPPORTUNITY";
  subjectId: string;
  provider: string;
  externalAccountId: string | null;
  campaignId: string | null;
  evidenceType: string;
  confidence: "HIGH" | "MEDIUM";
  status: "OBSERVED" | "CONFIRMED" | "REJECTED";
  observedAt: Date;
  opportunityCount: number;
  wonOpportunityCount: number;
  wonRevenue: number;
  currency: string | null;
}>;

export type AttributionIntelligence = Readonly<{
  coverage: Awaited<ReturnType<typeof loadAttributionCoverage>>;
  campaigns: readonly AttributionCampaignIntelligence[];
  reviewQueue: readonly AttributionReviewItem[];
}>;

export class AttributionReviewNotFoundError extends Error {}
export class AttributionReviewValidationError extends Error {}

export async function loadAttributionIntelligence(
  database: DatabaseClient,
  input: Readonly<{ workspaceId: string; from: Date; to: Date }>,
): Promise<AttributionIntelligence> {
  const [coverage, campaigns, reviewQueue] = await Promise.all([
    loadAttributionCoverage(database, input),
    database.$queryRaw<AttributionCampaignIntelligence[]>`
      SELECT
        provider,
        external_account_id AS "externalAccountId",
        campaign_id AS "campaignId",
        currency,
        attributed_leads AS "attributedLeads",
        attributed_won_deals AS "attributedWonDeals",
        attributed_revenue::double precision AS "attributedRevenue",
        media_spend::double precision AS "mediaSpend",
        attributed_roas::double precision AS "attributedRoas",
        confidence_high_count AS "confidenceHighCount",
        confidence_medium_count AS "confidenceMediumCount",
        status_observed_count AS "statusObservedCount",
        status_confirmed_count AS "statusConfirmedCount",
        status_rejected_count AS "statusRejectedCount",
        calculated_at AS "calculatedAt"
      FROM growth_attribution_campaign_metrics
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND period_start = ${input.from}
        AND period_end = ${input.to}
      ORDER BY attributed_revenue DESC, attributed_leads DESC, provider, campaign_id
    `,
    database.$queryRaw<AttributionReviewItem[]>`
      SELECT
        a.id,
        a.subject_type AS "subjectType",
        a.subject_id AS "subjectId",
        a.provider,
        a.external_account_id AS "externalAccountId",
        a.campaign_id AS "campaignId",
        a.evidence_type AS "evidenceType",
        a.confidence,
        a.status,
        a.observed_at AS "observedAt",
        COUNT(DISTINCT o.id)::int AS "opportunityCount",
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'WON')::int AS "wonOpportunityCount",
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'WON'), 0)::double precision AS "wonRevenue",
        CASE WHEN COUNT(DISTINCT o.currency) = 1 THEN MAX(o.currency) ELSE NULL END AS currency
      FROM growth_attribution_links a
      LEFT JOIN growth_crm_opportunities o
        ON a.subject_type = 'LEAD'
        AND o.workspace_id = a.workspace_id
        AND o.primary_lead_id = a.subject_id
      WHERE a.workspace_id = ${input.workspaceId}::uuid
        AND a.status = 'OBSERVED'
        AND a.campaign_id IS NOT NULL
        AND a.observed_at BETWEEN ${input.from} AND ${input.to}
      GROUP BY a.id
      ORDER BY CASE a.confidence WHEN 'MEDIUM' THEN 0 ELSE 1 END, a.observed_at DESC
      LIMIT 100
    `,
  ]);

  return { coverage, campaigns, reviewQueue };
}

export async function reviewAttributionLink(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    attributionLinkId: string;
    decision: "CONFIRMED" | "REJECTED";
    from: Date;
    to: Date;
  }>,
): Promise<AttributionReviewItem> {
  const tenant = requireWorkspace(input.tenant);
  if (input.to < input.from) throw new AttributionReviewValidationError("Attribution review period is invalid.");
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: ATTRIBUTION_REVIEW_PERMISSION,
  });

  const existing = await findAttributionLink(dependencies.database, tenant.workspaceId, input.attributionLinkId);
  if (!existing) throw new AttributionReviewNotFoundError("Attribution link not found in this workspace.");
  if (existing.status !== "OBSERVED") {
    throw new AttributionReviewValidationError("Only OBSERVED attribution links can be reviewed.");
  }

  const rows = await dependencies.database.$queryRaw<AttributionReviewItem[]>`
    UPDATE growth_attribution_links
    SET status = ${input.decision}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${input.attributionLinkId}::uuid
      AND workspace_id = ${tenant.workspaceId}::uuid
      AND status = 'OBSERVED'
    RETURNING
      id, subject_type AS "subjectType", subject_id AS "subjectId", provider,
      external_account_id AS "externalAccountId", campaign_id AS "campaignId",
      evidence_type AS "evidenceType", confidence, status, observed_at AS "observedAt",
      0::int AS "opportunityCount", 0::int AS "wonOpportunityCount",
      0::double precision AS "wonRevenue", NULL::text AS currency
  `;
  const updated = rows[0];
  if (!updated) throw new AttributionReviewNotFoundError("Attribution link disappeared during review.");

  if (input.decision === "CONFIRMED" && existing.subjectType === "LEAD") {
    await propagateConfirmedLeadAttribution(dependencies.database, tenant.workspaceId, existing);
  }
  await materializeAttributedCampaignRevenue(dependencies.database, {
    workspaceId: tenant.workspaceId,
    from: input.from,
    to: input.to,
  });

  await dependencies.database.auditEvent.create({
    data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: input.userId,
      action: "growth.attribution.reviewed",
      resourceType: "growth_attribution_link",
      resourceId: updated.id,
      metadata: {
        decision: updated.status,
        evidenceType: updated.evidenceType,
        confidence: updated.confidence,
        provider: updated.provider,
        campaignId: updated.campaignId ?? "",
        opportunityPropagation: input.decision === "CONFIRMED" && existing.subjectType === "LEAD" ? "enabled" : "not_applicable",
        rematerialized: "true",
      },
    },
  });

  return updated;
}

type StoredAttributionLink = Readonly<{
  id: string;
  status: "OBSERVED" | "CONFIRMED" | "REJECTED";
  subjectType: "LEAD" | "OPPORTUNITY";
  subjectId: string;
  provider: string;
  externalAccountId: string | null;
  campaignId: string | null;
  evidenceType: string;
  evidenceHash: string;
  confidence: "HIGH" | "MEDIUM";
  observedAt: Date;
}>;

async function propagateConfirmedLeadAttribution(
  database: DatabaseClient,
  workspaceId: string,
  source: StoredAttributionLink,
): Promise<number> {
  if (!source.campaignId) return 0;
  return database.$executeRaw`
    INSERT INTO growth_attribution_links (
      id, workspace_id, subject_type, subject_id, provider, external_account_id,
      campaign_id, evidence_type, evidence_hash, confidence, status, observed_at
    )
    SELECT
      gen_random_uuid(), ${workspaceId}::uuid, 'OPPORTUNITY', o.id,
      ${source.provider}, ${source.externalAccountId}, ${source.campaignId},
      ${source.evidenceType}, ${source.evidenceHash}, ${source.confidence}, 'CONFIRMED', ${source.observedAt}
    FROM growth_crm_opportunities o
    WHERE o.workspace_id = ${workspaceId}::uuid
      AND o.primary_lead_id = ${source.subjectId}::uuid
    ON CONFLICT (workspace_id, subject_type, subject_id, evidence_type, evidence_hash)
    DO UPDATE SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP
  `;
}

async function findAttributionLink(database: DatabaseClient, workspaceId: string, id: string): Promise<StoredAttributionLink | null> {
  const rows = await database.$queryRaw<StoredAttributionLink[]>`
    SELECT
      id, status, subject_type AS "subjectType", subject_id AS "subjectId", provider,
      external_account_id AS "externalAccountId", campaign_id AS "campaignId",
      evidence_type AS "evidenceType", evidence_hash AS "evidenceHash",
      confidence, observed_at AS "observedAt"
    FROM growth_attribution_links
    WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new AttributionReviewValidationError("Attribution review requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
