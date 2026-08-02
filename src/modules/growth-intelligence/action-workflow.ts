import { randomUUID } from "node:crypto";

import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { loadAuthorizedInterpretedCommandCenterIntelligence } from "./authorized-intelligence";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "./permissions";

export type GrowthActionStatus = "OPEN" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

export type GrowthActionItem = Readonly<{
  id: string;
  workspaceId: string;
  sectorPackId: string;
  sectorPackVersion: string;
  ruleId: string;
  ruleVersion: string;
  actionId: string;
  recommendationKey: string;
  title: string;
  rationale: string;
  priority: number;
  status: GrowthActionStatus;
  responsibleUserId: string | null;
  createdByUserId: string;
  acceptedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export class GrowthActionValidationError extends Error {}
export class GrowthActionWorkspaceRequiredError extends Error {}
export class GrowthActionNotFoundError extends Error {}

const allowedTransitions: Record<GrowthActionStatus, readonly GrowthActionStatus[]> = {
  OPEN: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
};

export async function createGrowthActionFromRecommendation(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    recommendationKey: string;
    responsibleUserId?: string | null;
    from: Date;
    to: Date;
  }>,
): Promise<GrowthActionItem> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });

  const intelligence = await loadAuthorizedInterpretedCommandCenterIntelligence(
    dependencies,
    { userId: input.userId, tenant, from: input.from, to: input.to },
  );
  const recommendation = intelligence.recommendations.find(
    (item) => item.key === input.recommendationKey,
  );
  if (!recommendation || !intelligence.sectorPack) {
    throw new GrowthActionValidationError("Recommendation is no longer active for this workspace and period.");
  }

  const responsibleUserId = input.responsibleUserId ?? input.userId;
  const id = randomUUID();
  const rows = await dependencies.database.$queryRaw<GrowthActionItem[]>`
    INSERT INTO growth_action_items (
      id, workspace_id, sector_pack_id, sector_pack_version,
      rule_id, rule_version, action_id, recommendation_key,
      title, rationale, priority, responsible_user_id, created_by_user_id
    ) VALUES (
      ${id}::uuid,
      ${tenant.workspaceId}::uuid,
      ${intelligence.sectorPack.id},
      ${intelligence.sectorPack.version},
      ${recommendation.ruleId},
      ${recommendation.ruleVersion},
      ${recommendation.actionId},
      ${recommendation.key},
      ${recommendation.title},
      ${recommendation.rationale},
      ${recommendation.priority},
      ${responsibleUserId}::uuid,
      ${input.userId}::uuid
    )
    ON CONFLICT (workspace_id, recommendation_key) DO UPDATE SET
      responsible_user_id = EXCLUDED.responsible_user_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      id,
      workspace_id AS "workspaceId",
      sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion",
      rule_id AS "ruleId",
      rule_version AS "ruleVersion",
      action_id AS "actionId",
      recommendation_key AS "recommendationKey",
      title,
      rationale,
      priority,
      status,
      responsible_user_id AS "responsibleUserId",
      created_by_user_id AS "createdByUserId",
      accepted_at AS "acceptedAt",
      started_at AS "startedAt",
      completed_at AS "completedAt",
      rejected_at AS "rejectedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
  const action = rows[0];
  if (!action) throw new GrowthActionValidationError("Unable to materialize recommendation.");

  await dependencies.database.auditEvent.create({
    data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: input.userId,
      action: "growth.action.materialized",
      resourceType: "growth_action_item",
      resourceId: action.id,
      metadata: {
        recommendationKey: recommendation.key,
        ruleId: recommendation.ruleId,
        ruleVersion: recommendation.ruleVersion,
        actionId: recommendation.actionId,
        responsibleUserId,
        evidence: [...recommendation.evidence],
      },
    },
  });

  return action;
}

export async function transitionGrowthAction(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    actionId: string;
    status: GrowthActionStatus;
    responsibleUserId?: string | null;
  }>,
): Promise<GrowthActionItem> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });

  const existing = await dependencies.database.$queryRaw<GrowthActionItem[]>`
    SELECT
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", action_id AS "actionId",
      recommendation_key AS "recommendationKey", title, rationale, priority, status,
      responsible_user_id AS "responsibleUserId", created_by_user_id AS "createdByUserId",
      accepted_at AS "acceptedAt", started_at AS "startedAt",
      completed_at AS "completedAt", rejected_at AS "rejectedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM growth_action_items
    WHERE id = ${input.actionId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    LIMIT 1
  `;
  const current = existing[0];
  if (!current) throw new GrowthActionNotFoundError("Growth action was not found in this workspace.");
  if (!allowedTransitions[current.status].includes(input.status)) {
    throw new GrowthActionValidationError(`Invalid transition ${current.status} -> ${input.status}.`);
  }

  const responsibleUserId = input.responsibleUserId === undefined
    ? current.responsibleUserId
    : input.responsibleUserId;
  const rows = await dependencies.database.$queryRaw<GrowthActionItem[]>`
    UPDATE growth_action_items
    SET
      status = ${input.status},
      responsible_user_id = ${responsibleUserId}::uuid,
      accepted_at = CASE WHEN ${input.status} = 'ACCEPTED' THEN CURRENT_TIMESTAMP ELSE accepted_at END,
      started_at = CASE WHEN ${input.status} = 'IN_PROGRESS' THEN CURRENT_TIMESTAMP ELSE started_at END,
      completed_at = CASE WHEN ${input.status} = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END,
      rejected_at = CASE WHEN ${input.status} = 'REJECTED' THEN CURRENT_TIMESTAMP ELSE rejected_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${input.actionId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    RETURNING
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", action_id AS "actionId",
      recommendation_key AS "recommendationKey", title, rationale, priority, status,
      responsible_user_id AS "responsibleUserId", created_by_user_id AS "createdByUserId",
      accepted_at AS "acceptedAt", started_at AS "startedAt",
      completed_at AS "completedAt", rejected_at AS "rejectedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const updated = rows[0];
  if (!updated) throw new GrowthActionNotFoundError("Growth action disappeared during transition.");

  await dependencies.database.auditEvent.create({
    data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: input.userId,
      action: "growth.action.transitioned",
      resourceType: "growth_action_item",
      resourceId: updated.id,
      metadata: {
        from: current.status,
        to: updated.status,
        responsibleUserId,
      },
    },
  });

  return updated;
}

export async function listGrowthActions(
  database: DatabaseClient,
  workspaceId: string,
): Promise<GrowthActionItem[]> {
  return database.$queryRaw<GrowthActionItem[]>`
    SELECT
      id, workspace_id AS "workspaceId", sector_pack_id AS "sectorPackId",
      sector_pack_version AS "sectorPackVersion", rule_id AS "ruleId",
      rule_version AS "ruleVersion", action_id AS "actionId",
      recommendation_key AS "recommendationKey", title, rationale, priority, status,
      responsible_user_id AS "responsibleUserId", created_by_user_id AS "createdByUserId",
      accepted_at AS "acceptedAt", started_at AS "startedAt",
      completed_at AS "completedAt", rejected_at AS "rejectedAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM growth_action_items
    WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY
      CASE status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'ACCEPTED' THEN 2
        WHEN 'OPEN' THEN 3
        WHEN 'COMPLETED' THEN 4
        ELSE 5
      END,
      priority DESC,
      created_at DESC
  `;
}

function requireWorkspace(value: TenantContext): TenantContext & {
  clientOrganizationId: string;
  workspaceId: string;
} {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new GrowthActionWorkspaceRequiredError("Growth action workflow requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
