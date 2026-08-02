import { randomUUID } from "node:crypto";

import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { GROWTH_INTELLIGENCE_PERMISSIONS } from "./permissions";

export class MetricGoalWorkspaceRequiredError extends Error {
  constructor() {
    super("Metric goal management requires an explicit workspace tenant context.");
    this.name = "MetricGoalWorkspaceRequiredError";
  }
}

export class MetricGoalValidationError extends Error {}

export async function setMetricGoal(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    metricId: string;
    currency?: string | null;
    targetValue: number;
    validFrom: Date;
  }>,
) {
  const tenant = parseTenantContext(input.tenant);
  if (!tenant.workspaceId || !tenant.clientOrganizationId) {
    throw new MetricGoalWorkspaceRequiredError();
  }
  const workspaceId = tenant.workspaceId;
  const clientOrganizationId = tenant.clientOrganizationId;

  if (!Number.isFinite(input.targetValue)) {
    throw new MetricGoalValidationError("Metric goal target must be finite.");
  }
  if (Number.isNaN(input.validFrom.getTime())) {
    throw new MetricGoalValidationError("Metric goal validFrom is invalid.");
  }

  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageGoals,
  });

  const committedPack = await dependencies.database.metricImportBatch.findFirst({
    where: { workspaceId, status: "COMMITTED" },
    orderBy: { committedAt: "desc" },
    select: { sectorPackId: true, sectorPackVersion: true },
  });
  if (!committedPack) {
    throw new MetricGoalValidationError("Workspace has no committed Sector Pack.");
  }

  const pack = await loadSectorPackManifest({
    id: committedPack.sectorPackId,
    version: committedPack.sectorPackVersion,
  });
  if (!pack.metrics.some((metric) => metric.id === input.metricId)) {
    throw new MetricGoalValidationError(
      `Metric ${input.metricId} is not declared by Sector Pack ${pack.id}@${pack.version}.`,
    );
  }

  const currency = normalizeCurrency(input.currency);
  const previousGoal = await dependencies.database.metricGoal.findFirst({
    where: {
      workspaceId,
      sectorPackId: pack.id,
      sectorPackVersion: pack.version,
      metricId: input.metricId,
      currency,
      validTo: null,
    },
    orderBy: { validFrom: "desc" },
  });

  if (previousGoal && previousGoal.validFrom >= input.validFrom) {
    throw new MetricGoalValidationError(
      "New goal must start after the currently open goal.",
    );
  }

  const id = randomUUID();
  const closeAt = new Date(input.validFrom.getTime() - 1);

  return dependencies.database.$transaction(async (transaction) => {
    if (previousGoal) {
      await transaction.metricGoal.update({
        where: { id: previousGoal.id },
        data: { validTo: closeAt },
      });
    }

    const goal = await transaction.metricGoal.create({
      data: {
        id,
        workspaceId,
        sectorPackId: pack.id,
        sectorPackVersion: pack.version,
        metricId: input.metricId,
        currency,
        targetValue: input.targetValue,
        validFrom: input.validFrom,
      },
    });

    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId,
        workspaceId,
        actorUserId: input.userId,
        action: previousGoal ? "growth.metric_goal.replaced" : "growth.metric_goal.created",
        resourceType: "metric_goal",
        resourceId: goal.id,
        metadata: {
          metricId: input.metricId,
          currency,
          targetValue: input.targetValue,
          sectorPackId: pack.id,
          sectorPackVersion: pack.version,
          validFrom: input.validFrom.toISOString(),
          previousGoalId: previousGoal?.id ?? null,
        },
      },
    });

    return goal;
  });
}

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new MetricGoalValidationError("Currency must be a 3-letter ISO code.");
  }
  return normalized;
}
