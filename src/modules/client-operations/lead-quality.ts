import { randomUUID } from "node:crypto";

import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

export const GROWTH_LEAD_QUALITY_CLASSES = ["UNREVIEWED", "INVALID", "UNQUALIFIED", "QUALIFIED", "HIGH_QUALITY", "CONVERTED"] as const;
export const GROWTH_LEAD_QUALITY_REASONS = ["SPAM", "DUPLICATE", "OUTSIDE_GEO", "OUTSIDE_PROFILE", "NO_INTENT", "LOW_INTENT", "VALID_FIT", "HIGH_INTENT", "SALES_ACCEPTED", "PURCHASED", "OTHER"] as const;
export const GROWTH_LEAD_SOURCE_CHANNELS = ["GOOGLE_ADS", "META_ADS", "HUBSPOT", "ORGANIC", "DIRECT", "REFERRAL", "OTHER"] as const;

export type GrowthLeadQualityClass = (typeof GROWTH_LEAD_QUALITY_CLASSES)[number];
export type GrowthLeadQualityReason = (typeof GROWTH_LEAD_QUALITY_REASONS)[number];
export type GrowthLeadSourceChannel = (typeof GROWTH_LEAD_SOURCE_CHANNELS)[number];

export type GrowthLeadQualityObservation = Readonly<{
  id: string;
  workspaceId: string;
  leadReference: string;
  sourceChannel: GrowthLeadSourceChannel;
  campaignReference: string | null;
  qualityClass: GrowthLeadQualityClass;
  reasonCode: GrowthLeadQualityReason | null;
  observedAt: Date;
  evidenceReference: string | null;
  createdByUserId: string;
  createdAt: Date;
}>;

export type GrowthLeadQualitySummary = Readonly<{
  totalLeads: number;
  reviewedLeads: number;
  unreviewedLeads: number;
  invalidLeads: number;
  unqualifiedLeads: number;
  qualifiedLeads: number;
  highQualityLeads: number;
  convertedLeads: number;
  qualificationRate: number | null;
  highQualityRate: number | null;
  conversionRate: number | null;
  invalidRate: number | null;
}>;

export type GrowthLeadQualitySegment = Readonly<{
  sourceChannel: GrowthLeadSourceChannel;
  campaignReference: string | null;
  summary: GrowthLeadQualitySummary;
}>;

export type GrowthLeadQualityWorkspace = Readonly<{
  summary: GrowthLeadQualitySummary;
  segments: readonly GrowthLeadQualitySegment[];
  latestObservations: readonly GrowthLeadQualityObservation[];
}>;

export class GrowthLeadQualityWorkspaceRequiredError extends Error {}
export class GrowthLeadQualityValidationError extends Error {}

export function summarizeLeadQuality(rows: readonly GrowthLeadQualityObservation[]): GrowthLeadQualitySummary {
  const latest = latestObservationPerLead(rows);
  const reviewed = latest.filter((row) => row.qualityClass !== "UNREVIEWED");
  const qualified = reviewed.filter((row) => isQualified(row.qualityClass));
  const highQuality = reviewed.filter((row) => row.qualityClass === "HIGH_QUALITY" || row.qualityClass === "CONVERTED");
  const converted = reviewed.filter((row) => row.qualityClass === "CONVERTED");
  const invalid = reviewed.filter((row) => row.qualityClass === "INVALID");
  const unqualified = reviewed.filter((row) => row.qualityClass === "UNQUALIFIED");
  const denominator = reviewed.length;
  return {
    totalLeads: latest.length,
    reviewedLeads: denominator,
    unreviewedLeads: latest.length - denominator,
    invalidLeads: invalid.length,
    unqualifiedLeads: unqualified.length,
    qualifiedLeads: qualified.length,
    highQualityLeads: highQuality.length,
    convertedLeads: converted.length,
    qualificationRate: rate(qualified.length, denominator),
    highQualityRate: rate(highQuality.length, denominator),
    conversionRate: rate(converted.length, denominator),
    invalidRate: rate(invalid.length, denominator),
  };
}

export function buildLeadQualitySegments(rows: readonly GrowthLeadQualityObservation[]): GrowthLeadQualitySegment[] {
  const latest = latestObservationPerLead(rows);
  const groups = new Map<string, GrowthLeadQualityObservation[]>();
  for (const row of latest) {
    const key = `${row.sourceChannel}::${row.campaignReference ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      sourceChannel: group[0]!.sourceChannel,
      campaignReference: group[0]!.campaignReference,
      summary: summarizeLeadQuality(group),
    }))
    .sort((a, b) => b.summary.reviewedLeads - a.summary.reviewedLeads
      || (b.summary.qualificationRate ?? -1) - (a.summary.qualificationRate ?? -1)
      || a.sourceChannel.localeCompare(b.sourceChannel));
}

export async function loadAuthorizedLeadQualityWorkspace(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<GrowthLeadQualityWorkspace> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: COMMAND_CENTER_PERMISSIONS.read });
  const rows = await dependencies.database.$queryRaw<GrowthLeadQualityObservation[]>`
    SELECT id, workspace_id AS "workspaceId", lead_reference AS "leadReference",
      source_channel::text AS "sourceChannel", campaign_reference AS "campaignReference",
      quality_class::text AS "qualityClass", reason_code::text AS "reasonCode",
      observed_at AS "observedAt", evidence_reference AS "evidenceReference",
      created_by_user_id AS "createdByUserId", created_at AS "createdAt"
    FROM growth_lead_quality_observations
    WHERE workspace_id = ${tenant.workspaceId}::uuid
    ORDER BY observed_at DESC, created_at DESC
    LIMIT 5000
  `;
  const latest = latestObservationPerLead(rows);
  return { summary: summarizeLeadQuality(latest), segments: buildLeadQualitySegments(latest), latestObservations: latest.slice(0, 200) };
}

export async function recordLeadQualityObservation(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    leadReference: string;
    sourceChannel: GrowthLeadSourceChannel;
    campaignReference?: string | null;
    qualityClass: GrowthLeadQualityClass;
    reasonCode?: GrowthLeadQualityReason | null;
    observedAt: Date;
    evidenceReference?: string | null;
  }>,
): Promise<GrowthLeadQualityObservation> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  const leadReference = normalizeOpaqueReference(input.leadReference, 120, "leadReference");
  const campaignReference = input.campaignReference ? normalizeOpaqueReference(input.campaignReference, 160, "campaignReference") : null;
  const evidenceReference = normalizeEvidenceReference(input.evidenceReference);
  validateReason(input.qualityClass, input.reasonCode ?? null);
  if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) throw new GrowthLeadQualityValidationError("observedAt is invalid.");
  const id = randomUUID();

  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<GrowthLeadQualityObservation[]>`
      INSERT INTO growth_lead_quality_observations (
        id, workspace_id, lead_reference, source_channel, campaign_reference,
        quality_class, reason_code, observed_at, evidence_reference, created_by_user_id
      ) VALUES (
        ${id}::uuid, ${tenant.workspaceId}::uuid, ${leadReference}, ${input.sourceChannel}::"GrowthLeadSourceChannel",
        ${campaignReference}, ${input.qualityClass}::"GrowthLeadQualityClass", ${input.reasonCode ?? null}::"GrowthLeadQualityReason",
        ${input.observedAt}, ${evidenceReference}, ${input.userId}::uuid
      )
      RETURNING id, workspace_id AS "workspaceId", lead_reference AS "leadReference",
        source_channel::text AS "sourceChannel", campaign_reference AS "campaignReference",
        quality_class::text AS "qualityClass", reason_code::text AS "reasonCode",
        observed_at AS "observedAt", evidence_reference AS "evidenceReference",
        created_by_user_id AS "createdByUserId", created_at AS "createdAt"
    `;
    const observation = rows[0];
    if (!observation) throw new GrowthLeadQualityValidationError("Unable to record lead quality observation.");
    await transaction.auditEvent.create({ data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: input.userId,
      action: "growth.lead_quality.observed",
      resourceType: "growth_lead_quality_observation",
      resourceId: id,
      metadata: {
        sourceChannel: input.sourceChannel,
        qualityClass: input.qualityClass,
        reasonCode: input.reasonCode ?? null,
        campaignReferencePresent: campaignReference !== null,
        piiStoredInLeadReference: false,
        attributionClaimMade: false,
        externalMutationExecuted: false,
      },
    } });
    return observation;
  });
}

function latestObservationPerLead(rows: readonly GrowthLeadQualityObservation[]): GrowthLeadQualityObservation[] {
  const sorted = [...rows].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  const seen = new Set<string>();
  const latest: GrowthLeadQualityObservation[] = [];
  for (const row of sorted) {
    if (seen.has(row.leadReference)) continue;
    seen.add(row.leadReference);
    latest.push(row);
  }
  return latest;
}

function isQualified(value: GrowthLeadQualityClass) {
  return value === "QUALIFIED" || value === "HIGH_QUALITY" || value === "CONVERTED";
}
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function validateReason(qualityClass: GrowthLeadQualityClass, reason: GrowthLeadQualityReason | null) {
  if (qualityClass === "UNREVIEWED" && reason !== null) throw new GrowthLeadQualityValidationError("UNREVIEWED must not carry a quality reason.");
  const allowed: Readonly<Record<Exclude<GrowthLeadQualityClass, "UNREVIEWED">, readonly GrowthLeadQualityReason[]>> = {
    INVALID: ["SPAM", "DUPLICATE", "OTHER"],
    UNQUALIFIED: ["OUTSIDE_GEO", "OUTSIDE_PROFILE", "NO_INTENT", "LOW_INTENT", "OTHER"],
    QUALIFIED: ["VALID_FIT", "HIGH_INTENT", "SALES_ACCEPTED", "OTHER"],
    HIGH_QUALITY: ["HIGH_INTENT", "SALES_ACCEPTED", "VALID_FIT", "OTHER"],
    CONVERTED: ["PURCHASED", "SALES_ACCEPTED", "OTHER"],
  };
  if (qualityClass !== "UNREVIEWED" && reason !== null && !allowed[qualityClass].includes(reason)) {
    throw new GrowthLeadQualityValidationError(`Reason ${reason} is not valid for ${qualityClass}.`);
  }
}

function normalizeOpaqueReference(value: string, maxLength: number, name: string) {
  const normalized = value.trim();
  if (!new RegExp(`^[A-Za-z0-9:_-]{1,${maxLength}}$`).test(normalized)) {
    throw new GrowthLeadQualityValidationError(`${name} must be an opaque non-PII identifier.`);
  }
  return normalized;
}

function normalizeEvidenceReference(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const reference = value.trim();
  if (reference.length > 240 || /[\r\n]/.test(reference)) throw new GrowthLeadQualityValidationError("Evidence reference is invalid.");
  const lower = reference.toLowerCase();
  const blocked = ["bearer ", "client_secret", "access_token", "refresh_token", "password=", "authorization:", "ghp_", "github_pat_", "sk-", "ya29."];
  if (blocked.some((marker) => lower.includes(marker))) throw new GrowthLeadQualityValidationError("Secret-like material is not allowed as evidence.");
  if (reference.length >= 80 && /^[A-Za-z0-9_./+=-]+$/.test(reference)) throw new GrowthLeadQualityValidationError("High-entropy material is not allowed as evidence.");
  return reference;
}

function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) throw new GrowthLeadQualityWorkspaceRequiredError("Lead Quality requires an explicit workspace.");
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
