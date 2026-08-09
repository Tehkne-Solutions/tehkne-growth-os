import { cookies } from "next/headers";
import { z } from "zod";

import {
  acknowledgePerformanceAnomaly,
  createBudgetPacingPlan,
  GrowthBudgetPacingNotFoundError,
  GrowthBudgetPacingValidationError,
  GrowthBudgetPacingWorkspaceRequiredError,
  recordBudgetPacingObservation,
  recordPerformanceAnomaly,
} from "@/modules/client-operations/budget-pacing";
import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { assertSameOrigin, getSessionCookieName, InvalidRequestOriginError } from "@/modules/identity/http/security";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const createPlanSchema = z.object({
  intent: z.literal("create_plan"),
  tenant: tenantSchema,
  label: z.string().trim().min(3).max(240),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  budgetAmount: z.number().finite().positive(),
  financialCurrency: z.string().trim().length(3),
  warningDeviationPct: z.number().finite().positive(),
  criticalDeviationPct: z.number().finite().positive(),
}).strict();

const observePlanSchema = z.object({
  intent: z.literal("observe_plan"),
  tenant: tenantSchema,
  planId: z.uuid(),
  observedAt: z.iso.datetime(),
  actualSpend: z.number().finite().nonnegative(),
  sourceReference: z.string().trim().max(240).optional().nullable(),
}).strict();

const anomalySchema = z.object({
  intent: z.literal("record_anomaly"),
  tenant: tenantSchema,
  metricId: z.string().trim().min(1).max(120),
  observedAt: z.iso.datetime(),
  observedValue: z.number().finite(),
  baselineValue: z.number().finite(),
  watchThresholdPct: z.number().finite().positive(),
  highThresholdPct: z.number().finite().positive(),
  criticalThresholdPct: z.number().finite().positive(),
  evidenceReference: z.string().trim().max(240).optional().nullable(),
}).strict();

const acknowledgeSchema = z.object({
  intent: z.literal("acknowledge_anomaly"),
  tenant: tenantSchema,
  anomalyId: z.uuid(),
}).strict();

const schema = z.discriminatedUnion("intent", [createPlanSchema, observePlanSchema, anomalySchema, acknowledgeSchema]);

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const secret = requireSessionSecret(environment);
    const token = (await cookies()).get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = schema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);

    if (body.intent === "create_plan") {
      const plan = await createBudgetPacingPlan(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          label: body.label,
          periodStart: new Date(body.periodStart),
          periodEnd: new Date(body.periodEnd),
          budgetAmount: body.budgetAmount,
          financialCurrency: body.financialCurrency,
          warningDeviationPct: body.warningDeviationPct,
          criticalDeviationPct: body.criticalDeviationPct,
        },
      );
      return Response.json(serializePlan(plan), { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (body.intent === "observe_plan") {
      const observation = await recordBudgetPacingObservation(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          planId: body.planId,
          observedAt: new Date(body.observedAt),
          actualSpend: body.actualSpend,
          ...(body.sourceReference === undefined ? {} : { sourceReference: body.sourceReference }),
        },
      );
      return Response.json(serializeObservation(observation), { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (body.intent === "record_anomaly") {
      const anomaly = await recordPerformanceAnomaly(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          metricId: body.metricId,
          observedAt: new Date(body.observedAt),
          observedValue: body.observedValue,
          baselineValue: body.baselineValue,
          watchThresholdPct: body.watchThresholdPct,
          highThresholdPct: body.highThresholdPct,
          criticalThresholdPct: body.criticalThresholdPct,
          ...(body.evidenceReference === undefined ? {} : { evidenceReference: body.evidenceReference }),
        },
      );
      return Response.json(serializeAnomaly(anomaly), { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    const anomaly = await acknowledgePerformanceAnomaly(
      { database, authorizationStore: repository },
      { userId: session.userId, tenant, anomalyId: body.anomalyId },
    );
    return Response.json(serializeAnomaly(anomaly), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "pacing_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof GrowthBudgetPacingNotFoundError) return Response.json({ error: "pacing_resource_not_found" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof GrowthBudgetPacingValidationError || error instanceof GrowthBudgetPacingWorkspaceRequiredError) {
      return Response.json({ error: "invalid_pacing_request" }, { status: 400 });
    }
    return Response.json({ error: "pacing_unavailable" }, { status: 503 });
  }
}

function serializePlan(plan: Awaited<ReturnType<typeof createBudgetPacingPlan>>) {
  return { ...plan, periodStart: plan.periodStart.toISOString(), periodEnd: plan.periodEnd.toISOString(), createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() };
}
function serializeObservation(observation: Awaited<ReturnType<typeof recordBudgetPacingObservation>>) {
  return { ...observation, observedAt: observation.observedAt.toISOString(), createdAt: observation.createdAt.toISOString() };
}
function serializeAnomaly(anomaly: Awaited<ReturnType<typeof recordPerformanceAnomaly>>) {
  return {
    ...anomaly,
    observedAt: anomaly.observedAt.toISOString(),
    acknowledgedAt: anomaly.acknowledgedAt?.toISOString() ?? null,
    createdAt: anomaly.createdAt.toISOString(),
  };
}
