import { randomUUID } from "node:crypto";

import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { GROWTH_INTELLIGENCE_PERMISSIONS } from "./permissions";

export type PlaybookReviewStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type PlaybookReviewProposal = Readonly<{
  id: string;
  workspaceId: string;
  sectorPackId: string;
  sectorPackVersion: string;
  ruleId: string;
  ruleVersion: string;
  status: PlaybookReviewStatus;
  title: string;
  rationale: string;
  proposedChange: Record<string, unknown>;
  evidenceSnapshot: Record<string, unknown>;
  createdByUserId: string;
  reviewedByUserId: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export class PlaybookReviewValidationError extends Error {}
export class PlaybookReviewNotFoundError extends Error {}

export function canTransitionPlaybookReview(
  from: PlaybookReviewStatus,
  to: Exclude<PlaybookReviewStatus, "DRAFT">,
): boolean {
  if (from === "DRAFT") return to === "SUBMITTED";
  if (from === "SUBMITTED") return to === "APPROVED" || to === "REJECTED";
  return false;
}

export async function createPlaybookReviewProposal(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    sectorPackId: string;
    sectorPackVersion: string;
    ruleId: string;
    ruleVersion: string;
    title: string;
    rationale: string;
    proposedChange: Record<string, unknown>;
    evidenceSnapshot: Record<string, unknown>;
  }>,
): Promise<PlaybookReviewProposal> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.reviewPlaybooks,
  });

  if (!input.title.trim() || !input.rationale.trim()) {
    throw new PlaybookReviewValidationError("Title and rationale are required.");
  }

  const id = randomUUID();
  const rows = await dependencies.database.$queryRaw<PlaybookReviewProposal[]>`
    INSERT INTO growth_playbook_review_proposals (
      id, workspace_id, sector_pack_id, sector_pack_version,
      rule_id, rule_version, title, rationale, proposed_change,
      evidence_snapshot, created_by_user_id
    ) VALUES (
      ${id}::uuid, ${tenant.workspaceId}::uuid, ${input.sectorPackId}, ${input.sectorPackVersion},
      ${input.ruleId}, ${input.ruleVersion}, ${input.title.trim()}, ${input.rationale.trim()},
      ${JSON.stringify(input.proposedChange)}::jsonb, ${JSON.stringify(input.evidenceSnapshot)}::jsonb,
      ${input.userId}::uuid
    )
    RETURNING
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", status, title, rationale,
      proposed_change AS "proposedChange", evidence_snapshot AS "evidenceSnapshot",
      created_by_user_id AS "createdByUserId", reviewed_by_user_id AS "reviewedByUserId",
      submitted_at AS "submittedAt", reviewed_at AS "reviewedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const proposal = rows[0];
  if (!proposal) throw new PlaybookReviewValidationError("Unable to create playbook review proposal.");

  await audit(dependencies.database, tenant, input.userId, proposal.id, "growth.playbook_review.created", {
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
  });
  return proposal;
}

export async function transitionPlaybookReviewProposal(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    proposalId: string;
    status: Exclude<PlaybookReviewStatus, "DRAFT">;
  }>,
): Promise<PlaybookReviewProposal> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.reviewPlaybooks,
  });

  const existing = await findProposal(dependencies.database, tenant.workspaceId, input.proposalId);
  if (!existing) throw new PlaybookReviewNotFoundError("Playbook review proposal not found in this workspace.");

  if (!canTransitionPlaybookReview(existing.status, input.status)) {
    throw new PlaybookReviewValidationError(`Invalid review transition ${existing.status} -> ${input.status}.`);
  }
  if ((input.status === "APPROVED" || input.status === "REJECTED") && existing.createdByUserId === input.userId) {
    throw new PlaybookReviewValidationError("A proposal cannot be reviewed by its creator.");
  }

  const rows = await dependencies.database.$queryRaw<PlaybookReviewProposal[]>`
    UPDATE growth_playbook_review_proposals
    SET status = ${input.status},
        submitted_at = CASE WHEN ${input.status} = 'SUBMITTED' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
        reviewed_by_user_id = CASE WHEN ${input.status} IN ('APPROVED', 'REJECTED') THEN ${input.userId}::uuid ELSE reviewed_by_user_id END,
        reviewed_at = CASE WHEN ${input.status} IN ('APPROVED', 'REJECTED') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${input.proposalId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    RETURNING
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", status, title, rationale,
      proposed_change AS "proposedChange", evidence_snapshot AS "evidenceSnapshot",
      created_by_user_id AS "createdByUserId", reviewed_by_user_id AS "reviewedByUserId",
      submitted_at AS "submittedAt", reviewed_at AS "reviewedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const updated = rows[0];
  if (!updated) throw new PlaybookReviewNotFoundError("Playbook review proposal disappeared during transition.");

  await audit(dependencies.database, tenant, input.userId, updated.id, "growth.playbook_review.transitioned", {
    from: existing.status,
    to: updated.status,
  });
  return updated;
}

export async function listPlaybookReviewProposals(database: DatabaseClient, workspaceId: string): Promise<PlaybookReviewProposal[]> {
  return database.$queryRaw<PlaybookReviewProposal[]>`
    SELECT
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", status, title, rationale,
      proposed_change AS "proposedChange", evidence_snapshot AS "evidenceSnapshot",
      created_by_user_id AS "createdByUserId", reviewed_by_user_id AS "reviewedByUserId",
      submitted_at AS "submittedAt", reviewed_at AS "reviewedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM growth_playbook_review_proposals
    WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY
      CASE status WHEN 'SUBMITTED' THEN 1 WHEN 'DRAFT' THEN 2 WHEN 'APPROVED' THEN 3 ELSE 4 END,
      created_at DESC
  `;
}

async function findProposal(database: DatabaseClient, workspaceId: string, proposalId: string) {
  const rows = await database.$queryRaw<PlaybookReviewProposal[]>`
    SELECT
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", status, title, rationale,
      proposed_change AS "proposedChange", evidence_snapshot AS "evidenceSnapshot",
      created_by_user_id AS "createdByUserId", reviewed_by_user_id AS "reviewedByUserId",
      submitted_at AS "submittedAt", reviewed_at AS "reviewedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM growth_playbook_review_proposals
    WHERE id = ${proposalId}::uuid AND workspace_id = ${workspaceId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
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
      resourceType: "growth_playbook_review_proposal",
      resourceId,
      metadata,
    },
  });
}

function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new PlaybookReviewValidationError("Playbook review requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
