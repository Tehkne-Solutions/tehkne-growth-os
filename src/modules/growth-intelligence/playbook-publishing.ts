import { randomUUID } from "node:crypto";

import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { loadDeclarativePlaybook } from "./load-playbook";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "./permissions";
import {
  validateDeclarativePlaybook,
  type DeclarativePlaybookRule,
} from "./playbooks";

export type PlaybookPublicationStatus = "DRAFT" | "VALIDATED" | "PUBLISHED" | "REJECTED";

export type PlaybookPublicationCandidate = Readonly<{
  id: string;
  workspaceId: string;
  proposalId: string;
  sectorPackId: string;
  sectorPackVersion: string;
  ruleId: string;
  baseRuleVersion: string;
  candidateRuleVersion: string;
  status: PlaybookPublicationStatus;
  candidateRule: DeclarativePlaybookRule;
  structuredDiff: Record<string, unknown>;
  createdByUserId: string;
  validatedByUserId: string | null;
  publishedByUserId: string | null;
  rejectedByUserId: string | null;
  createdAt: Date;
  validatedAt: Date | null;
  publishedAt: Date | null;
  rejectedAt: Date | null;
}>;

export class PlaybookPublicationValidationError extends Error {}
export class PlaybookPublicationNotFoundError extends Error {}

export function canTransitionPlaybookPublication(
  from: PlaybookPublicationStatus,
  to: Exclude<PlaybookPublicationStatus, "DRAFT">,
): boolean {
  if (from === "DRAFT") return to === "VALIDATED" || to === "REJECTED";
  if (from === "VALIDATED") return to === "PUBLISHED" || to === "REJECTED";
  return false;
}

export async function createPlaybookPublicationCandidate(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    proposalId: string;
    candidateRule: DeclarativePlaybookRule;
  }>,
): Promise<PlaybookPublicationCandidate> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.publishPlaybooks,
  });

  const proposalRows = await dependencies.database.$queryRaw<Array<{
    id: string;
    status: string;
    sectorPackId: string;
    sectorPackVersion: string;
    ruleId: string;
    ruleVersion: string;
  }>>`
    SELECT id, status, sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId", rule_version AS "ruleVersion"
    FROM growth_playbook_review_proposals
    WHERE id = ${input.proposalId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    LIMIT 1
  `;
  const proposal = proposalRows[0];
  if (!proposal) throw new PlaybookPublicationNotFoundError("Approved proposal was not found in this workspace.");
  if (proposal.status !== "APPROVED") {
    throw new PlaybookPublicationValidationError("Only approved proposals can become publication candidates.");
  }

  const canonical = await loadDeclarativePlaybook({
    sectorPackId: proposal.sectorPackId,
    sectorPackVersion: proposal.sectorPackVersion,
  });
  if (!canonical) throw new PlaybookPublicationValidationError("Canonical playbook is missing.");
  const baseRule = canonical.rules.find((rule) => rule.id === proposal.ruleId);
  if (!baseRule || baseRule.version !== proposal.ruleVersion) {
    throw new PlaybookPublicationValidationError("Proposal base rule no longer matches the canonical playbook.");
  }

  const candidateRule = validateCandidateRule(canonical.sectorPackId, canonical.sectorPackVersion, input.candidateRule);
  if (candidateRule.id !== baseRule.id) {
    throw new PlaybookPublicationValidationError("Candidate must preserve the approved rule id.");
  }
  if (compareSemver(candidateRule.version, baseRule.version) <= 0) {
    throw new PlaybookPublicationValidationError("Candidate rule version must be greater than the approved base version.");
  }

  const id = randomUUID();
  const structuredDiff = buildRuleDiff(baseRule, candidateRule);
  const rows = await dependencies.database.$queryRaw<PlaybookPublicationCandidate[]>`
    INSERT INTO growth_playbook_publication_candidates (
      id, workspace_id, proposal_id, sector_pack_id, sector_pack_version,
      rule_id, base_rule_version, candidate_rule_version, candidate_rule,
      structured_diff, created_by_user_id
    ) VALUES (
      ${id}::uuid, ${tenant.workspaceId}::uuid, ${proposal.id}::uuid,
      ${proposal.sectorPackId}, ${proposal.sectorPackVersion}, ${proposal.ruleId},
      ${baseRule.version}, ${candidateRule.version}, ${JSON.stringify(candidateRule)}::jsonb,
      ${JSON.stringify(structuredDiff)}::jsonb, ${input.userId}::uuid
    )
    RETURNING
      id, workspace_id AS "workspaceId", proposal_id AS "proposalId",
      sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId", base_rule_version AS "baseRuleVersion",
      candidate_rule_version AS "candidateRuleVersion", status,
      candidate_rule AS "candidateRule", structured_diff AS "structuredDiff",
      created_by_user_id AS "createdByUserId", validated_by_user_id AS "validatedByUserId",
      published_by_user_id AS "publishedByUserId", rejected_by_user_id AS "rejectedByUserId",
      created_at AS "createdAt", validated_at AS "validatedAt",
      published_at AS "publishedAt", rejected_at AS "rejectedAt"
  `;
  const candidate = rows[0];
  if (!candidate) throw new PlaybookPublicationValidationError("Unable to create publication candidate.");

  await audit(dependencies.database, tenant, input.userId, candidate.id, "growth.playbook_candidate.created", {
    proposalId: proposal.id,
    ruleId: candidate.ruleId,
    baseRuleVersion: candidate.baseRuleVersion,
    candidateRuleVersion: candidate.candidateRuleVersion,
  });
  return candidate;
}

export async function transitionPlaybookPublicationCandidate(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    candidateId: string;
    status: Exclude<PlaybookPublicationStatus, "DRAFT">;
  }>,
): Promise<PlaybookPublicationCandidate> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.publishPlaybooks,
  });

  const existing = await findCandidate(dependencies.database, tenant.workspaceId, input.candidateId);
  if (!existing) throw new PlaybookPublicationNotFoundError("Publication candidate was not found in this workspace.");
  if (!canTransitionPlaybookPublication(existing.status, input.status)) {
    throw new PlaybookPublicationValidationError(`Invalid publication transition ${existing.status} -> ${input.status}.`);
  }
  if (input.status === "PUBLISHED" && existing.createdByUserId === input.userId) {
    throw new PlaybookPublicationValidationError("Candidate creator cannot publish their own candidate.");
  }

  if (input.status === "VALIDATED" || input.status === "PUBLISHED") {
    validateCandidateRule(existing.sectorPackId, existing.sectorPackVersion, existing.candidateRule);
  }

  const rows = await dependencies.database.$queryRaw<PlaybookPublicationCandidate[]>`
    UPDATE growth_playbook_publication_candidates
    SET status = ${input.status},
      validated_by_user_id = CASE WHEN ${input.status} = 'VALIDATED' THEN ${input.userId}::uuid ELSE validated_by_user_id END,
      validated_at = CASE WHEN ${input.status} = 'VALIDATED' THEN CURRENT_TIMESTAMP ELSE validated_at END,
      published_by_user_id = CASE WHEN ${input.status} = 'PUBLISHED' THEN ${input.userId}::uuid ELSE published_by_user_id END,
      published_at = CASE WHEN ${input.status} = 'PUBLISHED' THEN CURRENT_TIMESTAMP ELSE published_at END,
      rejected_by_user_id = CASE WHEN ${input.status} = 'REJECTED' THEN ${input.userId}::uuid ELSE rejected_by_user_id END,
      rejected_at = CASE WHEN ${input.status} = 'REJECTED' THEN CURRENT_TIMESTAMP ELSE rejected_at END
    WHERE id = ${input.candidateId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    RETURNING
      id, workspace_id AS "workspaceId", proposal_id AS "proposalId",
      sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId", base_rule_version AS "baseRuleVersion",
      candidate_rule_version AS "candidateRuleVersion", status,
      candidate_rule AS "candidateRule", structured_diff AS "structuredDiff",
      created_by_user_id AS "createdByUserId", validated_by_user_id AS "validatedByUserId",
      published_by_user_id AS "publishedByUserId", rejected_by_user_id AS "rejectedByUserId",
      created_at AS "createdAt", validated_at AS "validatedAt",
      published_at AS "publishedAt", rejected_at AS "rejectedAt"
  `;
  const updated = rows[0];
  if (!updated) throw new PlaybookPublicationNotFoundError("Publication candidate disappeared during transition.");

  await audit(dependencies.database, tenant, input.userId, updated.id, "growth.playbook_candidate.transitioned", {
    from: existing.status,
    to: updated.status,
    ruleId: updated.ruleId,
    candidateRuleVersion: updated.candidateRuleVersion,
  });
  return updated;
}

export async function listPlaybookPublicationCandidates(
  database: DatabaseClient,
  workspaceId: string,
): Promise<PlaybookPublicationCandidate[]> {
  return database.$queryRaw<PlaybookPublicationCandidate[]>`
    SELECT
      id, workspace_id AS "workspaceId", proposal_id AS "proposalId",
      sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId", base_rule_version AS "baseRuleVersion",
      candidate_rule_version AS "candidateRuleVersion", status,
      candidate_rule AS "candidateRule", structured_diff AS "structuredDiff",
      created_by_user_id AS "createdByUserId", validated_by_user_id AS "validatedByUserId",
      published_by_user_id AS "publishedByUserId", rejected_by_user_id AS "rejectedByUserId",
      created_at AS "createdAt", validated_at AS "validatedAt",
      published_at AS "publishedAt", rejected_at AS "rejectedAt"
    FROM growth_playbook_publication_candidates
    WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY
      CASE status WHEN 'VALIDATED' THEN 1 WHEN 'DRAFT' THEN 2 WHEN 'PUBLISHED' THEN 3 ELSE 4 END,
      created_at DESC
  `;
}

async function findCandidate(database: DatabaseClient, workspaceId: string, candidateId: string) {
  const rows = await database.$queryRaw<PlaybookPublicationCandidate[]>`
    SELECT
      id, workspace_id AS "workspaceId", proposal_id AS "proposalId",
      sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId", base_rule_version AS "baseRuleVersion",
      candidate_rule_version AS "candidateRuleVersion", status,
      candidate_rule AS "candidateRule", structured_diff AS "structuredDiff",
      created_by_user_id AS "createdByUserId", validated_by_user_id AS "validatedByUserId",
      published_by_user_id AS "publishedByUserId", rejected_by_user_id AS "rejectedByUserId",
      created_at AS "createdAt", validated_at AS "validatedAt",
      published_at AS "publishedAt", rejected_at AS "rejectedAt"
    FROM growth_playbook_publication_candidates
    WHERE id = ${candidateId}::uuid AND workspace_id = ${workspaceId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function validateCandidateRule(
  sectorPackId: string,
  sectorPackVersion: string,
  candidateRule: DeclarativePlaybookRule,
): DeclarativePlaybookRule {
  const validated = validateDeclarativePlaybook({
    sectorPackId,
    sectorPackVersion,
    rules: [candidateRule],
  });
  const rule = validated.rules[0];
  if (!rule) throw new PlaybookPublicationValidationError("Candidate rule is empty.");
  return rule;
}

export function buildRuleDiff(
  baseRule: DeclarativePlaybookRule,
  candidateRule: DeclarativePlaybookRule,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of ["version", "name", "status", "priority", "when", "action"] as const) {
    if (JSON.stringify(baseRule[key]) !== JSON.stringify(candidateRule[key])) {
      diff[key] = { before: baseRule[key], after: candidateRule[key] };
    }
  }
  return diff;
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function audit(
  database: DatabaseClient,
  tenant: TenantContext & { clientOrganizationId: string; workspaceId: string },
  userId: string,
  resourceId: string,
  action: string,
  metadata: Readonly<Record<string, string>>,
) {
  await database.auditEvent.create({
    data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: userId,
      action,
      resourceType: "growth_playbook_publication_candidate",
      resourceId,
      metadata,
    },
  });
}

function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new PlaybookPublicationValidationError("Playbook publishing requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
