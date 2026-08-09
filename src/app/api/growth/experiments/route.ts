import { cookies } from "next/headers";
import { z } from "zod";

import {
  createGrowthExperiment,
  GROWTH_EXPERIMENT_CATEGORIES,
  GROWTH_EXPERIMENT_DECISIONS,
  GROWTH_EXPERIMENT_DESIGNS,
  GROWTH_EXPERIMENT_STATUSES,
  GrowthExperimentNotFoundError,
  GrowthExperimentValidationError,
  GrowthExperimentWorkspaceRequiredError,
  transitionGrowthExperiment,
} from "@/modules/client-operations/experiment-registry";
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

const createSchema = z.object({
  intent: z.literal("create"),
  tenant: tenantSchema,
  title: z.string().trim().min(3).max(240),
  hypothesis: z.string().trim().min(10).max(5000),
  category: z.enum(GROWTH_EXPERIMENT_CATEGORIES),
  design: z.enum(GROWTH_EXPERIMENT_DESIGNS),
  targetMetricId: z.string().trim().min(1).max(120),
  guardrailMetricId: z.string().trim().max(120).optional().nullable(),
  baselineValue: z.number().finite().optional().nullable(),
  baselinePeriodStart: z.iso.datetime().optional().nullable(),
  baselinePeriodEnd: z.iso.datetime().optional().nullable(),
  intervention: z.string().trim().min(3).max(5000),
  ownerUserId: z.uuid().optional().nullable(),
  observationUntil: z.iso.datetime().optional().nullable(),
}).strict();

const transitionSchema = z.object({
  intent: z.literal("transition"),
  tenant: tenantSchema,
  experimentId: z.uuid(),
  toStatus: z.enum(GROWTH_EXPERIMENT_STATUSES),
  resultSummary: z.string().trim().max(5000).optional().nullable(),
  decision: z.enum(GROWTH_EXPERIMENT_DECISIONS).optional().nullable(),
  learning: z.string().trim().max(5000).optional().nullable(),
}).strict();

const schema = z.discriminatedUnion("intent", [createSchema, transitionSchema]);

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

    const experiment = body.intent === "create"
      ? await createGrowthExperiment(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            title: body.title,
            hypothesis: body.hypothesis,
            category: body.category,
            design: body.design,
            targetMetricId: body.targetMetricId,
            intervention: body.intervention,
            ...(body.guardrailMetricId === undefined ? {} : { guardrailMetricId: body.guardrailMetricId }),
            ...(body.baselineValue === undefined ? {} : { baselineValue: body.baselineValue }),
            ...(body.baselinePeriodStart === undefined ? {} : { baselinePeriodStart: body.baselinePeriodStart ? new Date(body.baselinePeriodStart) : null }),
            ...(body.baselinePeriodEnd === undefined ? {} : { baselinePeriodEnd: body.baselinePeriodEnd ? new Date(body.baselinePeriodEnd) : null }),
            ...(body.ownerUserId === undefined ? {} : { ownerUserId: body.ownerUserId }),
            ...(body.observationUntil === undefined ? {} : { observationUntil: body.observationUntil ? new Date(body.observationUntil) : null }),
          },
        )
      : await transitionGrowthExperiment(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            experimentId: body.experimentId,
            toStatus: body.toStatus,
            ...(body.resultSummary === undefined ? {} : { resultSummary: body.resultSummary }),
            ...(body.decision === undefined ? {} : { decision: body.decision }),
            ...(body.learning === undefined ? {} : { learning: body.learning }),
          },
        );

    return Response.json(serialize(experiment), {
      status: body.intent === "create" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "experiment_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof GrowthExperimentNotFoundError) return Response.json({ error: "experiment_not_found" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof GrowthExperimentValidationError || error instanceof GrowthExperimentWorkspaceRequiredError) {
      return Response.json({ error: "invalid_experiment_request" }, { status: 400 });
    }
    return Response.json({ error: "experiment_registry_unavailable" }, { status: 503 });
  }
}

function serialize(experiment: Awaited<ReturnType<typeof createGrowthExperiment>>) {
  return {
    ...experiment,
    baselinePeriodStart: experiment.baselinePeriodStart?.toISOString() ?? null,
    baselinePeriodEnd: experiment.baselinePeriodEnd?.toISOString() ?? null,
    startAt: experiment.startAt?.toISOString() ?? null,
    observationUntil: experiment.observationUntil?.toISOString() ?? null,
    concludedAt: experiment.concludedAt?.toISOString() ?? null,
    createdAt: experiment.createdAt.toISOString(),
    updatedAt: experiment.updatedAt.toISOString(),
  };
}
