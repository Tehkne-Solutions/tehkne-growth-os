import { randomUUID } from "node:crypto";

import { loadCommandCenterSnapshot } from "@/modules/command-center/query";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { GROWTH_INTELLIGENCE_PERMISSIONS } from "./permissions";
import { loadSectorPackManifest } from "./sector-pack-loader";
import { interpretMetricMovement } from "./semantics";

export type ActionEffectivenessOutcome =
  | "IMPROVED"
  | "WORSENED"
  | "NEUTRAL"
  | "CONTEXT_REQUIRED"
  | "INSUFFICIENT_DATA";

export type ActionEffectivenessRecord = Readonly<{
  id: string;
  workspaceId: string;
  actionItemId: string;
  metricId: string;
  currency: string | null;
  baselineFrom: Date;
  baselineTo: Date;
  evaluationFrom: Date;
  evaluationTo: Date;
  baselineValue: number;
  evaluationValue: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  outcome: ActionEffectivenessOutcome;
  recordedByUserId: string;
  recordedAt: Date;
}>;

export class ActionEffectivenessValidationError extends Error {}
export class ActionEffectivenessNotFoundError extends Error {}

export async function evaluateCompletedGrowthAction(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    actionItemId: string;
    metricId: string;
    currency?: string | null;
    baselineFrom: Date;
    baselineTo: Date;
    evaluationFrom: Date;
    evaluationTo: Date;
  }>,
): Promise<ActionEffectivenessRecord> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });

  validateWindows(input.baselineFrom, input.baselineTo, input.evaluationFrom, input.evaluationTo);

  const actionRows = await dependencies.database.$queryRaw<Array<{
    id: string;
    status: string;
    sectorPackId: string;
    sectorPackVersion: string;
  }>>`
    SELECT id, status, sector_pack_id AS "sectorPackId", sector_pack_version AS "sectorPackVersion"
    FROM growth_action_items
    WHERE id = ${input.actionItemId}::uuid AND workspace_id = ${tenant.workspaceId}::uuid
    LIMIT 1
  `;
  const action = actionRows[0];
  if (!action) throw new ActionEffectivenessNotFoundError("Growth action was not found in this workspace.");
  if (action.status !== "COMPLETED") {
    throw new ActionEffectivenessValidationError("Only completed actions can be evaluated.");
  }

  const pack = await loadSectorPackManifest(action.sectorPackId, action.sectorPackVersion);
  const metric = pack.metrics.find((item) => item.id === input.metricId);
  if (!metric) throw new ActionEffectivenessValidationError("Metric is not declared by the action Sector Pack.");

  const [baseline, evaluation] = await Promise.all([
    loadCommandCenterSnapshot(dependencies.database, {
      workspaceId: tenant.workspaceId,
      from: input.baselineFrom,
      to: input.baselineTo,
    }),
    loadCommandCenterSnapshot(dependencies.database, {
      workspaceId: tenant.workspaceId,
      from: input.evaluationFrom,
      to: input.evaluationTo,
    }),
  ]);

  const currency = input.currency ?? null;
  const baselineMetric = baseline.metrics.find((item) => item.metricId === input.metricId && item.currency === currency);
  const evaluationMetric = evaluation.metrics.find((item) => item.metricId === input.metricId && item.currency === currency);
  if (!baselineMetric || !evaluationMetric) {
    throw new ActionEffectivenessValidationError("Baseline and evaluation windows both require the selected metric.");
  }

  const absoluteDelta = evaluationMetric.value - baselineMetric.value;
  const percentageDelta = baselineMetric.value === 0 ? null : (absoluteDelta / Math.abs(baselineMetric.value)) * 100;
  const interpretation = interpretMetricMovement({
    currentValue: evaluationMetric.value,
    previousValue: baselineMetric.value,
    direction: metric.direction,
  });
  const outcome: ActionEffectivenessOutcome = interpretation.outcome === "improved"
    ? "IMPROVED"
    : interpretation.outcome === "worsened"
      ? "WORSENED"
      : interpretation.outcome === "neutral"
        ? "NEUTRAL"
        : interpretation.outcome === "context-required"
          ? "CONTEXT_REQUIRED"
          : "INSUFFICIENT_DATA";

  const id = randomUUID();
  const currencyKey = currency ?? "";
  const rows = await dependencies.database.$queryRaw<ActionEffectivenessRecord[]>`
    INSERT INTO growth_action_outcomes (
      id, workspace_id, action_item_id, metric_id, currency,
      baseline_from, baseline_to, evaluation_from, evaluation_to,
      baseline_value, evaluation_value, absolute_delta, percentage_delta,
      outcome, recorded_by_user_id
    ) VALUES (
      ${id}::uuid, ${tenant.workspaceId}::uuid, ${input.actionItemId}::uuid,
      ${input.metricId}, ${currencyKey},
      ${input.baselineFrom}, ${input.baselineTo}, ${input.evaluationFrom}, ${input.evaluationTo},
      ${baselineMetric.value}, ${evaluationMetric.value}, ${absoluteDelta}, ${percentageDelta},
      ${outcome}, ${input.userId}::uuid
    )
    ON CONFLICT (action_item_id, metric_id, currency) DO UPDATE SET
      evaluation_from = EXCLUDED.evaluation_from,
      evaluation_to = EXCLUDED.evaluation_to,
      baseline_value = EXCLUDED.baseline_value,
      evaluation_value = EXCLUDED.evaluation_value,
      absolute_delta = EXCLUDED.absolute_delta,
      percentage_delta = EXCLUDED.percentage_delta,
      outcome = EXCLUDED.outcome,
      recorded_by_user_id = EXCLUDED.recorded_by_user_id,
      recorded_at = CURRENT_TIMESTAMP
    RETURNING
      id,
      workspace_id AS "workspaceId",
      action_item_id AS "actionItemId",
      metric_id AS "metricId",
      NULLIF(currency, '') AS currency,
      baseline_from AS "baselineFrom",
      baseline_to AS "baselineTo",
      evaluation_from AS "evaluationFrom",
      evaluation_to AS "evaluationTo",
      baseline_value AS "baselineValue",
      evaluation_value AS "evaluationValue",
      absolute_delta AS "absoluteDelta",
      percentage_delta AS "percentageDelta",
      outcome,
      recorded_by_user_id AS "recordedByUserId",
      recorded_at AS "recordedAt"
  `;
  const record = rows[0];
  if (!record) throw new ActionEffectivenessValidationError("Unable to persist action effectiveness.");

  await dependencies.database.auditEvent.create({
    data: {
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId,
      workspaceId: tenant.workspaceId,
      actorUserId: input.userId,
      action: "growth.action.effectiveness_recorded",
      resourceType: "growth_action_item",
      resourceId: input.actionItemId,
      metadata: {
        metricId: input.metricId,
        currency,
        baselineFrom: input.baselineFrom.toISOString(),
        baselineTo: input.baselineTo.toISOString(),
        evaluationFrom: input.evaluationFrom.toISOString(),
        evaluationTo: input.evaluationTo.toISOString(),
        baselineValue: baselineMetric.value,
        evaluationValue: evaluationMetric.value,
        absoluteDelta,
        percentageDelta,
        outcome,
        causality: "not_asserted",
      },
    },
  });

  return record;
}

export async function listActionEffectiveness(
  database: DatabaseClient,
  workspaceId: string,
): Promise<ActionEffectivenessRecord[]> {
  return database.$queryRaw<ActionEffectivenessRecord[]>`
    SELECT
      id,
      workspace_id AS "workspaceId",
      action_item_id AS "actionItemId",
      metric_id AS "metricId",
      NULLIF(currency, '') AS currency,
      baseline_from AS "baselineFrom",
      baseline_to AS "baselineTo",
      evaluation_from AS "evaluationFrom",
      evaluation_to AS "evaluationTo",
      baseline_value AS "baselineValue",
      evaluation_value AS "evaluationValue",
      absolute_delta AS "absoluteDelta",
      percentage_delta AS "percentageDelta",
      outcome,
      recorded_by_user_id AS "recordedByUserId",
      recorded_at AS "recordedAt"
    FROM growth_action_outcomes
    WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY recorded_at DESC
  `;
}

function validateWindows(baselineFrom: Date, baselineTo: Date, evaluationFrom: Date, evaluationTo: Date) {
  if (baselineTo < baselineFrom || evaluationTo < evaluationFrom) {
    throw new ActionEffectivenessValidationError("Evaluation windows are inverted.");
  }
  if (evaluationFrom <= baselineTo) {
    throw new ActionEffectivenessValidationError("Evaluation window must start after the baseline window.");
  }
}

function requireWorkspace(value: TenantContext): TenantContext & { clientOrganizationId: string; workspaceId: string } {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new ActionEffectivenessValidationError("Action effectiveness requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
