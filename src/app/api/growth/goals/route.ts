import { cookies } from "next/headers";
import { z } from "zod";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import {
  assertSameOrigin,
  getSessionCookieName,
  InvalidRequestOriginError,
} from "@/modules/identity/http/security";
import {
  MetricGoalValidationError,
  MetricGoalWorkspaceRequiredError,
  setMetricGoal,
} from "@/modules/growth-intelligence/manage-goals";
import { parseTenantContext } from "@/modules/tenancy";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const goalSchema = z
  .object({
    tenant: z
      .object({
        operatorOrganizationId: z.uuid(),
        clientOrganizationId: z.uuid(),
        brandId: z.uuid().optional(),
        workspaceId: z.uuid(),
      })
      .strict(),
    metricId: z.string().trim().min(1).max(120),
    currency: z.string().trim().length(3).optional().nullable(),
    targetValue: z.number().finite(),
    validFrom: z.iso.datetime({ offset: true }),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);

    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = goalSchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);
    const optionalGoalInput =
      body.currency === undefined ? {} : { currency: body.currency };

    const goal = await setMetricGoal(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant,
        metricId: body.metricId,
        targetValue: body.targetValue,
        validFrom: new Date(body.validFrom),
        ...optionalGoalInput,
      },
    );

    return Response.json(
      {
        id: goal.id,
        workspaceId: goal.workspaceId,
        metricId: goal.metricId,
        currency: goal.currency,
        targetValue: Number(goal.targetValue),
        validFrom: goal.validFrom.toISOString(),
        validTo: goal.validTo?.toISOString() ?? null,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "goal_management_forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof MetricGoalWorkspaceRequiredError ||
      error instanceof MetricGoalValidationError
    ) {
      return Response.json({ error: "invalid_metric_goal" }, { status: 400 });
    }
    return Response.json({ error: "metric_goal_unavailable" }, { status: 503 });
  }
}
