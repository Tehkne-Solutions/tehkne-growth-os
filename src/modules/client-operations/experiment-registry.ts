import { randomUUID } from "node:crypto";

import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient, DatabaseInputJsonValue } from "@/shared/db/client";

export const GROWTH_EXPERIMENT_STATUSES = ["DRAFT", "READY", "RUNNING", "OBSERVING", "CONCLUDED", "CANCELLED"] as const;
export const GROWTH_EXPERIMENT_CATEGORIES = ["AUDIENCE", "OFFER", "CREATIVE", "COPY", "LANDING_PAGE", "FORM_FRICTION", "BIDDING", "CONVERSION_SIGNAL", "BUDGET_DISTRIBUTION", "CRM_FOLLOW_UP", "RETENTION_REACTIVATION", "OTHER"] as const;
export const GROWTH_EXPERIMENT_DESIGNS = ["OBSERVATIONAL", "BEFORE_AFTER", "AB_TEST", "HOLDOUT", "GEO_EXPERIMENT", "OTHER"] as const;
export const GROWTH_EXPERIMENT_DECISIONS = ["SCALE", "ITERATE", "STOP", "MAINTAIN", "INCONCLUSIVE", "CANCELLED"] as const;

export type GrowthExperimentStatus = (typeof GROWTH_EXPERIMENT_STATUSES)[number];
export type GrowthExperimentCategory = (typeof GROWTH_EXPERIMENT_CATEGORIES)[number];
export type GrowthExperimentDesign = (typeof GROWTH_EXPERIMENT_DESIGNS)[number];
export type GrowthExperimentDecision = (typeof GROWTH_EXPERIMENT_DECISIONS)[number];

export type GrowthExperiment = Readonly<{
  id: string;
  workspaceId: string;
  title: string;
  hypothesis: string;
  category: GrowthExperimentCategory;
  design: GrowthExperimentDesign;
  targetMetricId: string;
  guardrailMetricId: string | null;
  baselineValue: number | null;
  baselinePeriodStart: Date | null;
  baselinePeriodEnd: Date | null;
  intervention: string;
  status: GrowthExperimentStatus;
  startAt: Date | null;
  observationUntil: Date | null;
  concludedAt: Date | null;
  ownerUserId: string | null;
  resultSummary: string | null;
  decision: GrowthExperimentDecision | null;
  learning: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export class GrowthExperimentWorkspaceRequiredError extends Error {}
export class GrowthExperimentNotFoundError extends Error {}
export class GrowthExperimentValidationError extends Error {}

const transitions: Readonly<Record<GrowthExperimentStatus, readonly GrowthExperimentStatus[]>> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["DRAFT", "RUNNING", "CANCELLED"],
  RUNNING: ["OBSERVING", "CONCLUDED", "CANCELLED"],
  OBSERVING: ["RUNNING", "CONCLUDED", "CANCELLED"],
  CONCLUDED: [],
  CANCELLED: [],
};

export function getAllowedExperimentTransitions(status: GrowthExperimentStatus): readonly GrowthExperimentStatus[] {
  return transitions[status];
}

export function experimentEvidenceCaveat(design: GrowthExperimentDesign): string {
  switch (design) {
    case "AB_TEST": return "A/B design registrado; causalidade ainda depende de execução válida, amostra e análise apropriadas.";
    case "HOLDOUT": return "Holdout registrado; inferência causal depende da comparabilidade e integridade do grupo de controle.";
    case "GEO_EXPERIMENT": return "Geo experiment registrado; causalidade depende de desenho, pareamento e contaminação entre regiões.";
    case "BEFORE_AFTER": return "Before/after é evidência temporal e não isola causalidade por si só.";
    case "OBSERVATIONAL": return "Evidência observacional não deve ser apresentada como causal.";
    case "OTHER": return "Design customizado: explicite limitações antes de qualquer afirmação causal.";
  }
}

export async function listAuthorizedGrowthExperiments(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<GrowthExperiment[]> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: COMMAND_CENTER_PERMISSIONS.read });
  return dependencies.database.$queryRaw<GrowthExperiment[]>`
    SELECT id, workspace_id AS "workspaceId", title, hypothesis,
      category::text AS category, design::text AS design,
      target_metric_id AS "targetMetricId", guardrail_metric_id AS "guardrailMetricId",
      baseline_value::double precision AS "baselineValue",
      baseline_period_start AS "baselinePeriodStart", baseline_period_end AS "baselinePeriodEnd",
      intervention, status::text AS status, start_at AS "startAt", observation_until AS "observationUntil",
      concluded_at AS "concludedAt", owner_user_id AS "ownerUserId",
      result_summary AS "resultSummary", decision::text AS decision, learning,
      created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM growth_experiments
    WHERE workspace_id = ${tenant.workspaceId}::uuid
    ORDER BY
      CASE status WHEN 'RUNNING' THEN 0 WHEN 'OBSERVING' THEN 1 WHEN 'READY' THEN 2 WHEN 'DRAFT' THEN 3 WHEN 'CONCLUDED' THEN 4 ELSE 5 END,
      updated_at DESC
    LIMIT 200
  `;
}

export async function createGrowthExperiment(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string; tenant: TenantContext; title: string; hypothesis: string;
    category: GrowthExperimentCategory; design: GrowthExperimentDesign; targetMetricId: string;
    guardrailMetricId?: string | null; baselineValue?: number | null;
    baselinePeriodStart?: Date | null; baselinePeriodEnd?: Date | null;
    intervention: string; ownerUserId?: string | null; observationUntil?: Date | null;
  }>,
): Promise<GrowthExperiment> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });
  const normalized = validateDraftInput(input);
  const id = randomUUID();

  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<GrowthExperiment[]>`
      INSERT INTO growth_experiments (
        id, workspace_id, title, hypothesis, category, design, target_metric_id, guardrail_metric_id,
        baseline_value, baseline_period_start, baseline_period_end, intervention, owner_user_id,
        observation_until, created_by_user_id, updated_by_user_id
      ) VALUES (
        ${id}::uuid, ${tenant.workspaceId}::uuid, ${normalized.title}, ${normalized.hypothesis},
        ${input.category}::"GrowthExperimentCategory", ${input.design}::"GrowthExperimentDesign",
        ${normalized.targetMetricId}, ${normalized.guardrailMetricId}, ${normalized.baselineValue},
        ${normalized.baselinePeriodStart}, ${normalized.baselinePeriodEnd}, ${normalized.intervention},
        ${normalized.ownerUserId}::uuid, ${normalized.observationUntil}, ${input.userId}::uuid, ${input.userId}::uuid
      )
      RETURNING id, workspace_id AS "workspaceId", title, hypothesis, category::text AS category,
        design::text AS design, target_metric_id AS "targetMetricId", guardrail_metric_id AS "guardrailMetricId",
        baseline_value::double precision AS "baselineValue", baseline_period_start AS "baselinePeriodStart",
        baseline_period_end AS "baselinePeriodEnd", intervention, status::text AS status, start_at AS "startAt",
        observation_until AS "observationUntil", concluded_at AS "concludedAt", owner_user_id AS "ownerUserId",
        result_summary AS "resultSummary", decision::text AS decision, learning,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const experiment = rows[0];
    if (!experiment) throw new GrowthExperimentValidationError("Unable to create experiment.");
    await transaction.auditEvent.create({
      data: auditData(tenant, input.userId, "growth.experiment.created", id, {
        category: input.category,
        design: input.design,
        targetMetricId: normalized.targetMetricId,
      }),
    });
    return experiment;
  });
}

export async function transitionGrowthExperiment(
  dependencies: Readonly<{ database: DatabaseClient; authorizationStore: AuthorizationMembershipStore }>,
  input: Readonly<{
    userId: string; tenant: TenantContext; experimentId: string; toStatus: GrowthExperimentStatus;
    resultSummary?: string | null; decision?: GrowthExperimentDecision | null; learning?: string | null;
  }>,
): Promise<GrowthExperiment> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, { userId: input.userId, tenant, permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions });

  return dependencies.database.$transaction(async (transaction) => {
    const currentRows = await transaction.$queryRaw<GrowthExperiment[]>`
      SELECT id, workspace_id AS "workspaceId", title, hypothesis, category::text AS category, design::text AS design,
        target_metric_id AS "targetMetricId", guardrail_metric_id AS "guardrailMetricId", baseline_value::double precision AS "baselineValue",
        baseline_period_start AS "baselinePeriodStart", baseline_period_end AS "baselinePeriodEnd", intervention,
        status::text AS status, start_at AS "startAt", observation_until AS "observationUntil", concluded_at AS "concludedAt",
        owner_user_id AS "ownerUserId", result_summary AS "resultSummary", decision::text AS decision, learning,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM growth_experiments WHERE id = ${input.experimentId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid LIMIT 1 FOR UPDATE
    `;
    const current = currentRows[0];
    if (!current) throw new GrowthExperimentNotFoundError("Experiment not found.");
    if (!getAllowedExperimentTransitions(current.status).includes(input.toStatus)) {
      throw new GrowthExperimentValidationError(`Invalid experiment transition ${current.status} -> ${input.toStatus}.`);
    }

    const conclusion = input.toStatus === "CONCLUDED" ? validateConclusion(input) : null;
    const cancellationDecision = input.toStatus === "CANCELLED" ? "CANCELLED" : null;
    const rows = await transaction.$queryRaw<GrowthExperiment[]>`
      UPDATE growth_experiments SET
        status = ${input.toStatus}::"GrowthExperimentStatus",
        start_at = CASE WHEN ${input.toStatus} = 'RUNNING' AND start_at IS NULL THEN CURRENT_TIMESTAMP ELSE start_at END,
        concluded_at = CASE WHEN ${input.toStatus} IN ('CONCLUDED','CANCELLED') THEN CURRENT_TIMESTAMP ELSE concluded_at END,
        result_summary = CASE WHEN ${input.toStatus} = 'CONCLUDED' THEN ${conclusion?.resultSummary ?? null} ELSE result_summary END,
        decision = CASE
          WHEN ${input.toStatus} = 'CONCLUDED' THEN ${conclusion?.decision ?? null}::"GrowthExperimentDecision"
          WHEN ${input.toStatus} = 'CANCELLED' THEN ${cancellationDecision}::"GrowthExperimentDecision"
          ELSE decision
        END,
        learning = CASE WHEN ${input.toStatus} = 'CONCLUDED' THEN ${conclusion?.learning ?? null} ELSE learning END,
        updated_by_user_id = ${input.userId}::uuid,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.experimentId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
      RETURNING id, workspace_id AS "workspaceId", title, hypothesis, category::text AS category,
        design::text AS design, target_metric_id AS "targetMetricId", guardrail_metric_id AS "guardrailMetricId",
        baseline_value::double precision AS "baselineValue", baseline_period_start AS "baselinePeriodStart",
        baseline_period_end AS "baselinePeriodEnd", intervention, status::text AS status, start_at AS "startAt",
        observation_until AS "observationUntil", concluded_at AS "concludedAt", owner_user_id AS "ownerUserId",
        result_summary AS "resultSummary", decision::text AS decision, learning,
        created_by_user_id AS "createdByUserId", updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const updated = rows[0];
    if (!updated) throw new GrowthExperimentNotFoundError("Experiment disappeared during transition.");
    await transaction.auditEvent.create({
      data: auditData(tenant, input.userId, "growth.experiment.transitioned", input.experimentId, {
        from: current.status,
        to: input.toStatus,
        design: current.design,
        ...(conclusion ? { decision: conclusion.decision } : {}),
      }),
    });
    return updated;
  });
}

function validateDraftInput(input: Readonly<{
  title: string; hypothesis: string; targetMetricId: string; guardrailMetricId?: string | null;
  baselineValue?: number | null; baselinePeriodStart?: Date | null; baselinePeriodEnd?: Date | null;
  intervention: string; ownerUserId?: string | null; observationUntil?: Date | null;
}>) {
  const title = requiredText(input.title, 240, 3, "title");
  const hypothesis = requiredText(input.hypothesis, 5000, 10, "hypothesis");
  const targetMetricId = requiredText(input.targetMetricId, 120, 1, "targetMetricId");
  const intervention = requiredText(input.intervention, 5000, 3, "intervention");
  const guardrailMetricId = optionalText(input.guardrailMetricId, 120);
  if (input.baselineValue !== null && input.baselineValue !== undefined && !Number.isFinite(input.baselineValue)) {
    throw new GrowthExperimentValidationError("baselineValue must be finite.");
  }
  const baselinePeriodStart = input.baselinePeriodStart ?? null;
  const baselinePeriodEnd = input.baselinePeriodEnd ?? null;
  if ((baselinePeriodStart === null) !== (baselinePeriodEnd === null)) {
    throw new GrowthExperimentValidationError("Baseline period requires both start and end.");
  }
  if (baselinePeriodStart && baselinePeriodEnd && baselinePeriodEnd < baselinePeriodStart) {
    throw new GrowthExperimentValidationError("Baseline period end must be after start.");
  }
  return {
    title,
    hypothesis,
    targetMetricId,
    intervention,
    guardrailMetricId,
    baselineValue: input.baselineValue ?? null,
    baselinePeriodStart,
    baselinePeriodEnd,
    ownerUserId: input.ownerUserId ?? null,
    observationUntil: input.observationUntil ?? null,
  };
}

function validateConclusion(input: Readonly<{
  resultSummary?: string | null;
  decision?: GrowthExperimentDecision | null;
  learning?: string | null;
}>) {
  const resultSummary = requiredText(input.resultSummary ?? "", 5000, 3, "resultSummary");
  const learning = requiredText(input.learning ?? "", 5000, 3, "learning");
  if (!input.decision || input.decision === "CANCELLED") {
    throw new GrowthExperimentValidationError("A concluded experiment requires a non-cancelled decision.");
  }
  return { resultSummary, decision: input.decision, learning };
}

function auditData(
  tenant: ReturnType<typeof requireWorkspace>,
  actorUserId: string,
  action: string,
  resourceId: string,
  metadata: DatabaseInputJsonValue,
) {
  return {
    operatorOrganizationId: tenant.operatorOrganizationId,
    clientOrganizationId: tenant.clientOrganizationId,
    workspaceId: tenant.workspaceId,
    actorUserId,
    action,
    resourceType: "growth_experiment",
    resourceId,
    metadata,
  };
}

function requiredText(value: string, max: number, min: number, name: string) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new GrowthExperimentValidationError(`${name} length is invalid.`);
  }
  return normalized;
}

function optionalText(value: string | null | undefined, max: number) {
  if (!value?.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > max) throw new GrowthExperimentValidationError("Optional text is too long.");
  return normalized;
}

function requireWorkspace(value: TenantContext): TenantContext & {
  clientOrganizationId: string;
  workspaceId: string;
} {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new GrowthExperimentWorkspaceRequiredError("Experiment Registry requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
