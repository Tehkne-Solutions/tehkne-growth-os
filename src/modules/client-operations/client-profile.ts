import { randomUUID } from "node:crypto";

import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

export const CLIENT_LIFECYCLE_STATES = [
  "INTAKE",
  "ACCESS_PENDING",
  "AUDIT",
  "TRACKING_REPAIR",
  "STRATEGY_READY",
  "LAUNCHING",
  "LEARNING",
  "OPTIMIZING",
  "SCALING",
  "STABLE_GROWTH",
  "AT_RISK",
  "PAUSED",
  "OFFBOARDING",
] as const;

export type ClientLifecycleState = (typeof CLIENT_LIFECYCLE_STATES)[number];

export type GrowthClientProfile = Readonly<{
  workspaceId: string;
  lifecycleState: ClientLifecycleState;
  primaryBusinessObjective: string | null;
  northStarMetricId: string | null;
  financialCurrency: string;
  averageTicket: number | null;
  monthlyMediaBudget: number | null;
  salesCycleDays: number | null;
  capacityNotes: string | null;
  seasonalityNotes: string | null;
  handoverSource: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ClientLifecycleTransition = Readonly<{
  id: string;
  workspaceId: string;
  fromState: ClientLifecycleState | null;
  toState: ClientLifecycleState;
  reason: string;
  actorUserId: string;
  occurredAt: Date;
}>;

export type ClientOperationsSnapshot = Readonly<{
  profile: GrowthClientProfile | null;
  transitions: readonly ClientLifecycleTransition[];
}>;

export class ClientOperationsWorkspaceRequiredError extends Error {}
export class ClientOperationsProfileNotFoundError extends Error {}
export class ClientOperationsValidationError extends Error {}

const allowedTransitions: Readonly<Record<ClientLifecycleState, readonly ClientLifecycleState[]>> = {
  INTAKE: ["ACCESS_PENDING", "AUDIT", "PAUSED", "OFFBOARDING"],
  ACCESS_PENDING: ["AUDIT", "PAUSED", "OFFBOARDING"],
  AUDIT: ["TRACKING_REPAIR", "STRATEGY_READY", "AT_RISK", "PAUSED", "OFFBOARDING"],
  TRACKING_REPAIR: ["AUDIT", "STRATEGY_READY", "AT_RISK", "PAUSED", "OFFBOARDING"],
  STRATEGY_READY: ["LAUNCHING", "AT_RISK", "PAUSED", "OFFBOARDING"],
  LAUNCHING: ["LEARNING", "AT_RISK", "PAUSED", "OFFBOARDING"],
  LEARNING: ["OPTIMIZING", "AT_RISK", "PAUSED", "OFFBOARDING"],
  OPTIMIZING: ["SCALING", "STABLE_GROWTH", "AT_RISK", "PAUSED", "OFFBOARDING"],
  SCALING: ["OPTIMIZING", "STABLE_GROWTH", "AT_RISK", "PAUSED", "OFFBOARDING"],
  STABLE_GROWTH: ["OPTIMIZING", "SCALING", "AT_RISK", "PAUSED", "OFFBOARDING"],
  AT_RISK: ["AUDIT", "TRACKING_REPAIR", "STRATEGY_READY", "OPTIMIZING", "PAUSED", "OFFBOARDING"],
  PAUSED: ["AUDIT", "STRATEGY_READY", "LEARNING", "OPTIMIZING", "OFFBOARDING"],
  OFFBOARDING: [],
};

export function getAllowedClientLifecycleTransitions(state: ClientLifecycleState): readonly ClientLifecycleState[] {
  return allowedTransitions[state];
}

export async function loadAuthorizedClientOperationsSnapshot(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<ClientOperationsSnapshot> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: COMMAND_CENTER_PERMISSIONS.read,
  });

  const [profiles, transitions] = await Promise.all([
    dependencies.database.$queryRaw<GrowthClientProfile[]>`
      SELECT
        workspace_id AS "workspaceId",
        lifecycle_state::text AS "lifecycleState",
        primary_business_objective AS "primaryBusinessObjective",
        north_star_metric_id AS "northStarMetricId",
        financial_currency AS "financialCurrency",
        average_ticket::double precision AS "averageTicket",
        monthly_media_budget::double precision AS "monthlyMediaBudget",
        sales_cycle_days AS "salesCycleDays",
        capacity_notes AS "capacityNotes",
        seasonality_notes AS "seasonalityNotes",
        handover_source AS "handoverSource",
        created_by_user_id AS "createdByUserId",
        updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM growth_client_profiles
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      LIMIT 1
    `,
    dependencies.database.$queryRaw<ClientLifecycleTransition[]>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        from_state::text AS "fromState",
        to_state::text AS "toState",
        reason,
        actor_user_id AS "actorUserId",
        occurred_at AS "occurredAt"
      FROM growth_client_lifecycle_transitions
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      ORDER BY occurred_at DESC
      LIMIT 30
    `,
  ]);

  return { profile: profiles[0] ?? null, transitions };
}

export async function saveClientOperationsProfile(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    primaryBusinessObjective?: string | null;
    northStarMetricId?: string | null;
    financialCurrency: string;
    averageTicket?: number | null;
    monthlyMediaBudget?: number | null;
    salesCycleDays?: number | null;
    capacityNotes?: string | null;
    seasonalityNotes?: string | null;
    handoverSource?: string | null;
  }>,
): Promise<GrowthClientProfile> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });

  const normalized = normalizeProfileInput(input);

  return dependencies.database.$transaction(async (transaction) => {
    const existing = await transaction.$queryRaw<Array<{ lifecycleState: ClientLifecycleState }>>`
      SELECT lifecycle_state::text AS "lifecycleState"
      FROM growth_client_profiles
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      LIMIT 1
      FOR UPDATE
    `;
    const created = existing.length === 0;

    const rows = await transaction.$queryRaw<GrowthClientProfile[]>`
      INSERT INTO growth_client_profiles (
        workspace_id,
        primary_business_objective,
        north_star_metric_id,
        financial_currency,
        average_ticket,
        monthly_media_budget,
        sales_cycle_days,
        capacity_notes,
        seasonality_notes,
        handover_source,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        ${tenant.workspaceId}::uuid,
        ${normalized.primaryBusinessObjective},
        ${normalized.northStarMetricId},
        ${normalized.financialCurrency},
        ${normalized.averageTicket},
        ${normalized.monthlyMediaBudget},
        ${normalized.salesCycleDays},
        ${normalized.capacityNotes},
        ${normalized.seasonalityNotes},
        ${normalized.handoverSource},
        ${input.userId}::uuid,
        ${input.userId}::uuid
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        primary_business_objective = EXCLUDED.primary_business_objective,
        north_star_metric_id = EXCLUDED.north_star_metric_id,
        financial_currency = EXCLUDED.financial_currency,
        average_ticket = EXCLUDED.average_ticket,
        monthly_media_budget = EXCLUDED.monthly_media_budget,
        sales_cycle_days = EXCLUDED.sales_cycle_days,
        capacity_notes = EXCLUDED.capacity_notes,
        seasonality_notes = EXCLUDED.seasonality_notes,
        handover_source = EXCLUDED.handover_source,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        workspace_id AS "workspaceId",
        lifecycle_state::text AS "lifecycleState",
        primary_business_objective AS "primaryBusinessObjective",
        north_star_metric_id AS "northStarMetricId",
        financial_currency AS "financialCurrency",
        average_ticket::double precision AS "averageTicket",
        monthly_media_budget::double precision AS "monthlyMediaBudget",
        sales_cycle_days AS "salesCycleDays",
        capacity_notes AS "capacityNotes",
        seasonality_notes AS "seasonalityNotes",
        handover_source AS "handoverSource",
        created_by_user_id AS "createdByUserId",
        updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const profile = rows[0];
    if (!profile) throw new ClientOperationsValidationError("Unable to persist client profile.");

    if (created) {
      await transaction.$executeRaw`
        INSERT INTO growth_client_lifecycle_transitions (
          id, workspace_id, from_state, to_state, reason, actor_user_id
        ) VALUES (
          ${randomUUID()}::uuid,
          ${tenant.workspaceId}::uuid,
          NULL,
          'INTAKE'::"ClientLifecycleState",
          'Intake operacional criado.',
          ${input.userId}::uuid
        )
      `;
    }

    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        workspaceId: tenant.workspaceId,
        actorUserId: input.userId,
        action: created ? "growth.client_profile.created" : "growth.client_profile.updated",
        resourceType: "growth_client_profile",
        resourceId: tenant.workspaceId,
        metadata: {
          lifecycleState: profile.lifecycleState,
          northStarMetricId: profile.northStarMetricId,
          financialCurrency: profile.financialCurrency,
          averageTicket: profile.averageTicket,
          monthlyMediaBudget: profile.monthlyMediaBudget,
          salesCycleDays: profile.salesCycleDays,
          handoverSource: profile.handoverSource,
        },
      },
    });

    return profile;
  });
}

export async function transitionClientLifecycle(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    toState: ClientLifecycleState;
    reason: string;
  }>,
): Promise<GrowthClientProfile> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });
  const reason = normalizeText(input.reason, 1000);
  if (!reason || reason.length < 3) {
    throw new ClientOperationsValidationError("Lifecycle transition reason must contain at least 3 characters.");
  }

  return dependencies.database.$transaction(async (transaction) => {
    const currentRows = await transaction.$queryRaw<GrowthClientProfile[]>`
      SELECT
        workspace_id AS "workspaceId",
        lifecycle_state::text AS "lifecycleState",
        primary_business_objective AS "primaryBusinessObjective",
        north_star_metric_id AS "northStarMetricId",
        financial_currency AS "financialCurrency",
        average_ticket::double precision AS "averageTicket",
        monthly_media_budget::double precision AS "monthlyMediaBudget",
        sales_cycle_days AS "salesCycleDays",
        capacity_notes AS "capacityNotes",
        seasonality_notes AS "seasonalityNotes",
        handover_source AS "handoverSource",
        created_by_user_id AS "createdByUserId",
        updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM growth_client_profiles
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      LIMIT 1
      FOR UPDATE
    `;
    const current = currentRows[0];
    if (!current) throw new ClientOperationsProfileNotFoundError("Create the client intake before changing lifecycle state.");
    if (!getAllowedClientLifecycleTransitions(current.lifecycleState).includes(input.toState)) {
      throw new ClientOperationsValidationError(`Invalid client lifecycle transition ${current.lifecycleState} -> ${input.toState}.`);
    }

    const rows = await transaction.$queryRaw<GrowthClientProfile[]>`
      UPDATE growth_client_profiles
      SET
        lifecycle_state = ${input.toState}::"ClientLifecycleState",
        updated_by_user_id = ${input.userId}::uuid,
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      RETURNING
        workspace_id AS "workspaceId",
        lifecycle_state::text AS "lifecycleState",
        primary_business_objective AS "primaryBusinessObjective",
        north_star_metric_id AS "northStarMetricId",
        financial_currency AS "financialCurrency",
        average_ticket::double precision AS "averageTicket",
        monthly_media_budget::double precision AS "monthlyMediaBudget",
        sales_cycle_days AS "salesCycleDays",
        capacity_notes AS "capacityNotes",
        seasonality_notes AS "seasonalityNotes",
        handover_source AS "handoverSource",
        created_by_user_id AS "createdByUserId",
        updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const updated = rows[0];
    if (!updated) throw new ClientOperationsProfileNotFoundError("Client profile disappeared during transition.");

    const transitionId = randomUUID();
    await transaction.$executeRaw`
      INSERT INTO growth_client_lifecycle_transitions (
        id, workspace_id, from_state, to_state, reason, actor_user_id
      ) VALUES (
        ${transitionId}::uuid,
        ${tenant.workspaceId}::uuid,
        ${current.lifecycleState}::"ClientLifecycleState",
        ${input.toState}::"ClientLifecycleState",
        ${reason},
        ${input.userId}::uuid
      )
    `;

    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        workspaceId: tenant.workspaceId,
        actorUserId: input.userId,
        action: "growth.client_lifecycle.transitioned",
        resourceType: "growth_client_profile",
        resourceId: tenant.workspaceId,
        metadata: {
          transitionId,
          from: current.lifecycleState,
          to: input.toState,
          reason,
        },
      },
    });

    return updated;
  });
}

function normalizeProfileInput(input: Readonly<{
  primaryBusinessObjective?: string | null;
  northStarMetricId?: string | null;
  financialCurrency: string;
  averageTicket?: number | null;
  monthlyMediaBudget?: number | null;
  salesCycleDays?: number | null;
  capacityNotes?: string | null;
  seasonalityNotes?: string | null;
  handoverSource?: string | null;
}>) {
  const financialCurrency = input.financialCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(financialCurrency)) {
    throw new ClientOperationsValidationError("Financial currency must be a 3-letter ISO code.");
  }
  validateNonNegative("averageTicket", input.averageTicket);
  validateNonNegative("monthlyMediaBudget", input.monthlyMediaBudget);
  if (input.salesCycleDays !== null && input.salesCycleDays !== undefined) {
    if (!Number.isInteger(input.salesCycleDays) || input.salesCycleDays < 0) {
      throw new ClientOperationsValidationError("salesCycleDays must be a non-negative integer.");
    }
  }

  return {
    primaryBusinessObjective: normalizeText(input.primaryBusinessObjective, 1000),
    northStarMetricId: normalizeText(input.northStarMetricId, 120),
    financialCurrency,
    averageTicket: input.averageTicket ?? null,
    monthlyMediaBudget: input.monthlyMediaBudget ?? null,
    salesCycleDays: input.salesCycleDays ?? null,
    capacityNotes: normalizeText(input.capacityNotes, 5000),
    seasonalityNotes: normalizeText(input.seasonalityNotes, 5000),
    handoverSource: normalizeText(input.handoverSource, 120),
  };
}

function validateNonNegative(name: string, value: number | null | undefined) {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new ClientOperationsValidationError(`${name} must be a non-negative finite number.`);
  }
}

function normalizeText(value: string | null | undefined, maxLength: number): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ClientOperationsValidationError(`Text exceeds ${maxLength} characters.`);
  }
  return normalized;
}

function requireWorkspace(value: TenantContext): TenantContext & {
  clientOrganizationId: string;
  workspaceId: string;
} {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new ClientOperationsWorkspaceRequiredError("Client operations require an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
