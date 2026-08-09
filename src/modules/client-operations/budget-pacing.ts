import { randomUUID } from "node:crypto";

import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

export const GROWTH_BUDGET_PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const GROWTH_BUDGET_PACING_STATUSES = ["NOT_STARTED", "ON_TRACK", "WATCH_UNDER", "WATCH_OVER", "CRITICAL_UNDER", "CRITICAL_OVER", "COMPLETE"] as const;
export const GROWTH_ANOMALY_DIRECTIONS = ["BELOW", "UNCHANGED", "ABOVE"] as const;
export const GROWTH_ANOMALY_SEVERITIES = ["UNCLASSIFIED", "WATCH", "HIGH", "CRITICAL"] as const;

export type GrowthBudgetPlanStatus = (typeof GROWTH_BUDGET_PLAN_STATUSES)[number];
export type GrowthBudgetPacingStatus = (typeof GROWTH_BUDGET_PACING_STATUSES)[number];
export type GrowthAnomalyDirection = (typeof GROWTH_ANOMALY_DIRECTIONS)[number];
export type GrowthAnomalySeverity = (typeof GROWTH_ANOMALY_SEVERITIES)[number];

export type GrowthBudgetPacingPlan = Readonly<{
  id: string;
  workspaceId: string;
  label: string;
  periodStart: Date;
  periodEnd: Date;
  budgetAmount: number;
  financialCurrency: string;
  warningDeviationPct: number;
  criticalDeviationPct: number;
  status: GrowthBudgetPlanStatus;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type GrowthBudgetPacingObservation = Readonly<{
  id: string;
  planId: string;
  observedAt: Date;
  actualSpend: number;
  elapsedRatio: number;
  expectedSpend: number;
  projectedSpend: number | null;
  deviationPct: number;
  status: GrowthBudgetPacingStatus;
  sourceReference: string | null;
  createdByUserId: string;
  createdAt: Date;
}>;

export type GrowthPerformanceAnomaly = Readonly<{
  id: string;
  workspaceId: string;
  metricId: string;
  observedAt: Date;
  observedValue: number;
  baselineValue: number;
  absoluteDelta: number;
  deviationPct: number | null;
  direction: GrowthAnomalyDirection;
  severity: GrowthAnomalySeverity;
  watchThresholdPct: number;
  highThresholdPct: number;
  criticalThresholdPct: number;
  evidenceReference: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  createdByUserId: string;
  createdAt: Date;
}>;

export type GrowthBudgetPacingWorkspace = Readonly<{
  plans: readonly Readonly<{
    plan: GrowthBudgetPacingPlan;
    latestObservation: GrowthBudgetPacingObservation | null;
  }>[];
  anomalies: readonly GrowthPerformanceAnomaly[];
}>;

export class GrowthBudgetPacingWorkspaceRequiredError extends Error {}
export class GrowthBudgetPacingNotFoundError extends Error {}
export class GrowthBudgetPacingValidationError extends Error {}

export function calculateBudgetPacing(input: Readonly<{
  periodStart: Date;
  periodEnd: Date;
  observedAt: Date;
  budgetAmount: number;
  actualSpend: number;
  warningDeviationPct: number;
  criticalDeviationPct: number;
}>): Readonly<{
  elapsedRatio: number;
  expectedSpend: number;
  projectedSpend: number | null;
  deviationPct: number;
  status: GrowthBudgetPacingStatus;
}> {
  validatePacingInputs(input);
  const duration = input.periodEnd.getTime() - input.periodStart.getTime();
  const elapsedMs = input.observedAt.getTime() - input.periodStart.getTime();
  if (elapsedMs <= 0) {
    return { elapsedRatio: 0, expectedSpend: 0, projectedSpend: null, deviationPct: 0, status: "NOT_STARTED" };
  }

  const complete = input.observedAt.getTime() >= input.periodEnd.getTime();
  const elapsedRatio = complete ? 1 : clamp(elapsedMs / duration, 0, 1);
  const expectedSpend = input.budgetAmount * elapsedRatio;
  const projectedSpend = elapsedRatio > 0 ? input.actualSpend / elapsedRatio : null;
  const deviationPct = expectedSpend > 0 ? ((input.actualSpend - expectedSpend) / expectedSpend) * 100 : 0;

  if (complete) {
    return { elapsedRatio, expectedSpend, projectedSpend, deviationPct, status: "COMPLETE" };
  }

  const absoluteDeviation = Math.abs(deviationPct);
  if (absoluteDeviation >= input.criticalDeviationPct) {
    return { elapsedRatio, expectedSpend, projectedSpend, deviationPct, status: deviationPct < 0 ? "CRITICAL_UNDER" : "CRITICAL_OVER" };
  }
  if (absoluteDeviation >= input.warningDeviationPct) {
    return { elapsedRatio, expectedSpend, projectedSpend, deviationPct, status: deviationPct < 0 ? "WATCH_UNDER" : "WATCH_OVER" };
  }
  return { elapsedRatio, expectedSpend, projectedSpend, deviationPct, status: "ON_TRACK" };
}

export function calculatePerformanceAnomaly(input: Readonly<{
  observedValue: number;
  baselineValue: number;
  watchThresholdPct: number;
  highThresholdPct: number;
  criticalThresholdPct: number;
}>): Readonly<{
  absoluteDelta: number;
  deviationPct: number | null;
  direction: GrowthAnomalyDirection;
  severity: GrowthAnomalySeverity;
}> {
  validateAnomalyInputs(input);
  const absoluteDelta = input.observedValue - input.baselineValue;
  const direction: GrowthAnomalyDirection = absoluteDelta === 0 ? "UNCHANGED" : absoluteDelta < 0 ? "BELOW" : "ABOVE";
  if (input.baselineValue === 0) {
    return { absoluteDelta, deviationPct: null, direction, severity: "UNCLASSIFIED" };
  }
  const deviationPct = (absoluteDelta / Math.abs(input.baselineValue)) * 100;
  const magnitude = Math.abs(deviationPct);
  const severity: GrowthAnomalySeverity = magnitude >= input.criticalThresholdPct
    ? "CRITICAL"
    : magnitude >= input.highThresholdPct
      ? "HIGH"
      : magnitude >= input.watchThresholdPct
        ? "WATCH"
        : "UNCLASSIFIED";
  return { absoluteDelta, deviationPct, direction, severity };
}

export async function loadAuthorizedBudgetPacingWorkspace(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<GrowthBudgetPacingWorkspace> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: COMMAND_CENTER_PERMISSIONS.read });

  const [plans, observations, anomalies] = await Promise.all([
    dependencies.database.$queryRaw<GrowthBudgetPacingPlan[]>`
      SELECT id, workspace_id AS "workspaceId", label, period_start AS "periodStart", period_end AS "periodEnd",
        budget_amount::double precision AS "budgetAmount", financial_currency AS "financialCurrency",
        warning_deviation_pct::double precision AS "warningDeviationPct",
        critical_deviation_pct::double precision AS "criticalDeviationPct", status::text AS status,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM growth_budget_pacing_plans
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, period_end DESC
      LIMIT 100
    `,
    dependencies.database.$queryRaw<GrowthBudgetPacingObservation[]>`
      SELECT o.id, o.plan_id AS "planId", o.observed_at AS "observedAt",
        o.actual_spend::double precision AS "actualSpend", o.elapsed_ratio::double precision AS "elapsedRatio",
        o.expected_spend::double precision AS "expectedSpend", o.projected_spend::double precision AS "projectedSpend",
        o.deviation_pct::double precision AS "deviationPct", o.status::text AS status,
        o.source_reference AS "sourceReference", o.created_by_user_id AS "createdByUserId", o.created_at AS "createdAt"
      FROM growth_budget_pacing_observations o
      JOIN growth_budget_pacing_plans p ON p.id = o.plan_id
      WHERE p.workspace_id = ${tenant.workspaceId}::uuid
      ORDER BY o.observed_at DESC, o.created_at DESC
      LIMIT 500
    `,
    dependencies.database.$queryRaw<GrowthPerformanceAnomaly[]>`
      SELECT id, workspace_id AS "workspaceId", metric_id AS "metricId", observed_at AS "observedAt",
        observed_value::double precision AS "observedValue", baseline_value::double precision AS "baselineValue",
        absolute_delta::double precision AS "absoluteDelta", deviation_pct::double precision AS "deviationPct",
        direction::text AS direction, severity::text AS severity,
        watch_threshold_pct::double precision AS "watchThresholdPct",
        high_threshold_pct::double precision AS "highThresholdPct",
        critical_threshold_pct::double precision AS "criticalThresholdPct",
        evidence_reference AS "evidenceReference", acknowledged_at AS "acknowledgedAt",
        acknowledged_by_user_id AS "acknowledgedByUserId", created_by_user_id AS "createdByUserId",
        created_at AS "createdAt"
      FROM growth_performance_anomalies
      WHERE workspace_id = ${tenant.workspaceId}::uuid
      ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'WATCH' THEN 2 ELSE 3 END,
        acknowledged_at NULLS FIRST, observed_at DESC
      LIMIT 200
    `,
  ]);
  const latestByPlan = new Map<string, GrowthBudgetPacingObservation>();
  for (const observation of observations) {
    if (!latestByPlan.has(observation.planId)) latestByPlan.set(observation.planId, observation);
  }
  return { plans: plans.map((plan) => ({ plan, latestObservation: latestByPlan.get(plan.id) ?? null })), anomalies };
}

export async function createBudgetPacingPlan(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string; tenant: TenantContext; label: string; periodStart: Date; periodEnd: Date;
    budgetAmount: number; financialCurrency: string; warningDeviationPct: number; criticalDeviationPct: number;
  }>,
): Promise<GrowthBudgetPacingPlan> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  validatePacingInputs({ ...input, observedAt: input.periodStart, actualSpend: 0 });
  const label = requiredText(input.label, 240, 3, "label");
  const currency = input.financialCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new GrowthBudgetPacingValidationError("financialCurrency must be a 3-letter ISO code.");
  const id = randomUUID();

  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<GrowthBudgetPacingPlan[]>`
      INSERT INTO growth_budget_pacing_plans (
        id, workspace_id, label, period_start, period_end, budget_amount, financial_currency,
        warning_deviation_pct, critical_deviation_pct, created_by_user_id, updated_by_user_id
      ) VALUES (
        ${id}::uuid, ${tenant.workspaceId}::uuid, ${label}, ${input.periodStart}, ${input.periodEnd},
        ${input.budgetAmount}, ${currency}, ${input.warningDeviationPct}, ${input.criticalDeviationPct},
        ${input.userId}::uuid, ${input.userId}::uuid
      )
      RETURNING id, workspace_id AS "workspaceId", label, period_start AS "periodStart", period_end AS "periodEnd",
        budget_amount::double precision AS "budgetAmount", financial_currency AS "financialCurrency",
        warning_deviation_pct::double precision AS "warningDeviationPct",
        critical_deviation_pct::double precision AS "criticalDeviationPct", status::text AS status,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const plan = rows[0];
    if (!plan) throw new GrowthBudgetPacingValidationError("Unable to create budget pacing plan.");
    await transaction.auditEvent.create({ data: {
      operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId, actorUserId: input.userId, action: "growth.budget_pacing.plan.created",
      resourceType: "growth_budget_pacing_plan", resourceId: id,
      metadata: { budgetAmount: input.budgetAmount, financialCurrency: currency, warningDeviationPct: input.warningDeviationPct, criticalDeviationPct: input.criticalDeviationPct },
    } });
    return plan;
  });
}

export async function recordBudgetPacingObservation(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{ userId: string; tenant: TenantContext; planId: string; observedAt: Date; actualSpend: number; sourceReference?: string | null }>,
): Promise<GrowthBudgetPacingObservation> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  const reference = normalizeReference(input.sourceReference);
  return dependencies.database.$transaction(async (transaction) => {
    const plans = await transaction.$queryRaw<GrowthBudgetPacingPlan[]>`
      SELECT id, workspace_id AS "workspaceId", label, period_start AS "periodStart", period_end AS "periodEnd",
        budget_amount::double precision AS "budgetAmount", financial_currency AS "financialCurrency",
        warning_deviation_pct::double precision AS "warningDeviationPct",
        critical_deviation_pct::double precision AS "criticalDeviationPct", status::text AS status,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM growth_budget_pacing_plans
      WHERE id = ${input.planId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid AND status = 'ACTIVE'
      LIMIT 1 FOR UPDATE
    `;
    const plan = plans[0];
    if (!plan) throw new GrowthBudgetPacingNotFoundError("Active budget pacing plan not found.");
    const pacing = calculateBudgetPacing({
      periodStart: plan.periodStart, periodEnd: plan.periodEnd, observedAt: input.observedAt,
      budgetAmount: plan.budgetAmount, actualSpend: input.actualSpend,
      warningDeviationPct: plan.warningDeviationPct, criticalDeviationPct: plan.criticalDeviationPct,
    });
    const id = randomUUID();
    const rows = await transaction.$queryRaw<GrowthBudgetPacingObservation[]>`
      INSERT INTO growth_budget_pacing_observations (
        id, plan_id, observed_at, actual_spend, elapsed_ratio, expected_spend, projected_spend,
        deviation_pct, status, source_reference, created_by_user_id
      ) VALUES (
        ${id}::uuid, ${plan.id}::uuid, ${input.observedAt}, ${input.actualSpend}, ${pacing.elapsedRatio},
        ${pacing.expectedSpend}, ${pacing.projectedSpend}, ${pacing.deviationPct},
        ${pacing.status}::"GrowthBudgetPacingStatus", ${reference}, ${input.userId}::uuid
      )
      RETURNING id, plan_id AS "planId", observed_at AS "observedAt", actual_spend::double precision AS "actualSpend",
        elapsed_ratio::double precision AS "elapsedRatio", expected_spend::double precision AS "expectedSpend",
        projected_spend::double precision AS "projectedSpend", deviation_pct::double precision AS "deviationPct",
        status::text AS status, source_reference AS "sourceReference", created_by_user_id AS "createdByUserId", created_at AS "createdAt"
    `;
    const observation = rows[0];
    if (!observation) throw new GrowthBudgetPacingValidationError("Unable to record pacing observation.");
    await transaction.auditEvent.create({ data: {
      operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId, actorUserId: input.userId, action: "growth.budget_pacing.observed",
      resourceType: "growth_budget_pacing_plan", resourceId: plan.id,
      metadata: { status: pacing.status, deviationPct: pacing.deviationPct, actualSpend: input.actualSpend, expectedSpend: pacing.expectedSpend, projectedSpend: pacing.projectedSpend, externalBudgetMutationExecuted: false },
    } });
    return observation;
  });
}

export async function recordPerformanceAnomaly(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string; tenant: TenantContext; metricId: string; observedAt: Date; observedValue: number; baselineValue: number;
    watchThresholdPct: number; highThresholdPct: number; criticalThresholdPct: number; evidenceReference?: string | null;
  }>,
): Promise<GrowthPerformanceAnomaly> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  const metricId = requiredText(input.metricId, 120, 1, "metricId");
  const anomaly = calculatePerformanceAnomaly(input);
  const reference = normalizeReference(input.evidenceReference);
  const id = randomUUID();
  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<GrowthPerformanceAnomaly[]>`
      INSERT INTO growth_performance_anomalies (
        id, workspace_id, metric_id, observed_at, observed_value, baseline_value, absolute_delta,
        deviation_pct, direction, severity, watch_threshold_pct, high_threshold_pct,
        critical_threshold_pct, evidence_reference, created_by_user_id
      ) VALUES (
        ${id}::uuid, ${tenant.workspaceId}::uuid, ${metricId}, ${input.observedAt}, ${input.observedValue},
        ${input.baselineValue}, ${anomaly.absoluteDelta}, ${anomaly.deviationPct},
        ${anomaly.direction}::"GrowthPerformanceAnomalyDirection", ${anomaly.severity}::"GrowthPerformanceAnomalySeverity",
        ${input.watchThresholdPct}, ${input.highThresholdPct}, ${input.criticalThresholdPct}, ${reference}, ${input.userId}::uuid
      )
      RETURNING id, workspace_id AS "workspaceId", metric_id AS "metricId", observed_at AS "observedAt",
        observed_value::double precision AS "observedValue", baseline_value::double precision AS "baselineValue",
        absolute_delta::double precision AS "absoluteDelta", deviation_pct::double precision AS "deviationPct",
        direction::text AS direction, severity::text AS severity,
        watch_threshold_pct::double precision AS "watchThresholdPct", high_threshold_pct::double precision AS "highThresholdPct",
        critical_threshold_pct::double precision AS "criticalThresholdPct", evidence_reference AS "evidenceReference",
        acknowledged_at AS "acknowledgedAt", acknowledged_by_user_id AS "acknowledgedByUserId",
        created_by_user_id AS "createdByUserId", created_at AS "createdAt"
    `;
    const row = rows[0];
    if (!row) throw new GrowthBudgetPacingValidationError("Unable to record performance anomaly.");
    await transaction.auditEvent.create({ data: {
      operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId, actorUserId: input.userId, action: "growth.performance_anomaly.recorded",
      resourceType: "growth_performance_anomaly", resourceId: id,
      metadata: { metricId, direction: anomaly.direction, severity: anomaly.severity, deviationPct: anomaly.deviationPct, causalClaimMade: false, externalMutationExecuted: false },
    } });
    return row;
  });
}

export async function acknowledgePerformanceAnomaly(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{ userId: string; tenant: TenantContext; anomalyId: string }>,
): Promise<GrowthPerformanceAnomaly> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  const rows = await dependencies.database.$queryRaw<GrowthPerformanceAnomaly[]>`
    UPDATE growth_performance_anomalies SET acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by_user_id = ${input.userId}::uuid
    WHERE id = ${input.anomalyId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid AND acknowledged_at IS NULL
    RETURNING id, workspace_id AS "workspaceId", metric_id AS "metricId", observed_at AS "observedAt",
      observed_value::double precision AS "observedValue", baseline_value::double precision AS "baselineValue",
      absolute_delta::double precision AS "absoluteDelta", deviation_pct::double precision AS "deviationPct",
      direction::text AS direction, severity::text AS severity,
      watch_threshold_pct::double precision AS "watchThresholdPct", high_threshold_pct::double precision AS "highThresholdPct",
      critical_threshold_pct::double precision AS "criticalThresholdPct", evidence_reference AS "evidenceReference",
      acknowledged_at AS "acknowledgedAt", acknowledged_by_user_id AS "acknowledgedByUserId",
      created_by_user_id AS "createdByUserId", created_at AS "createdAt"
  `;
  const anomaly = rows[0];
  if (!anomaly) throw new GrowthBudgetPacingNotFoundError("Unacknowledged anomaly not found.");
  return anomaly;
}

function validatePacingInputs(input: Readonly<{
  periodStart: Date; periodEnd: Date; observedAt: Date; budgetAmount: number; actualSpend: number;
  warningDeviationPct: number; criticalDeviationPct: number;
}>) {
  if (!(input.periodStart instanceof Date) || Number.isNaN(input.periodStart.getTime())) throw new GrowthBudgetPacingValidationError("periodStart is invalid.");
  if (!(input.periodEnd instanceof Date) || Number.isNaN(input.periodEnd.getTime()) || input.periodEnd <= input.periodStart) throw new GrowthBudgetPacingValidationError("periodEnd must be after periodStart.");
  if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) throw new GrowthBudgetPacingValidationError("observedAt is invalid.");
  if (!Number.isFinite(input.budgetAmount) || input.budgetAmount <= 0) throw new GrowthBudgetPacingValidationError("budgetAmount must be positive.");
  if (!Number.isFinite(input.actualSpend) || input.actualSpend < 0) throw new GrowthBudgetPacingValidationError("actualSpend must be non-negative.");
  if (!Number.isFinite(input.warningDeviationPct) || input.warningDeviationPct <= 0) throw new GrowthBudgetPacingValidationError("warningDeviationPct must be positive.");
  if (!Number.isFinite(input.criticalDeviationPct) || input.criticalDeviationPct < input.warningDeviationPct) throw new GrowthBudgetPacingValidationError("criticalDeviationPct must be >= warningDeviationPct.");
}

function validateAnomalyInputs(input: Readonly<{
  observedValue: number; baselineValue: number; watchThresholdPct: number; highThresholdPct: number; criticalThresholdPct: number;
}>) {
  for (const value of [input.observedValue, input.baselineValue]) if (!Number.isFinite(value)) throw new GrowthBudgetPacingValidationError("Anomaly values must be finite.");
  if (!Number.isFinite(input.watchThresholdPct) || input.watchThresholdPct <= 0) throw new GrowthBudgetPacingValidationError("watchThresholdPct must be positive.");
  if (!Number.isFinite(input.highThresholdPct) || input.highThresholdPct < input.watchThresholdPct) throw new GrowthBudgetPacingValidationError("highThresholdPct must be >= watchThresholdPct.");
  if (!Number.isFinite(input.criticalThresholdPct) || input.criticalThresholdPct < input.highThresholdPct) throw new GrowthBudgetPacingValidationError("criticalThresholdPct must be >= highThresholdPct.");
}

function normalizeReference(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const reference = value.trim();
  if (reference.length > 240 || /[\r\n]/.test(reference)) throw new GrowthBudgetPacingValidationError("Reference is invalid.");
  const lower = reference.toLowerCase();
  const blocked = ["bearer ", "client_secret", "access_token", "refresh_token", "password=", "authorization:", "ghp_", "github_pat_", "sk-", "ya29."];
  if (blocked.some((marker) => lower.includes(marker))) throw new GrowthBudgetPacingValidationError("Secret-like material is not allowed as evidence.");
  if (reference.length >= 80 && /^[A-Za-z0-9_./+=-]+$/.test(reference)) throw new GrowthBudgetPacingValidationError("High-entropy material is not allowed as evidence.");
  return reference;
}

function requiredText(value: string, max: number, min: number, name: string) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new GrowthBudgetPacingValidationError(`${name} length is invalid.`);
  return normalized;
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) throw new GrowthBudgetPacingWorkspaceRequiredError("Budget pacing requires an explicit workspace.");
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
