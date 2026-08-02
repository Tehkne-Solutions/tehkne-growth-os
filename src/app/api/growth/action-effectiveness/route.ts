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
  ActionEffectivenessNotFoundError,
  ActionEffectivenessValidationError,
  evaluateCompletedGrowthAction,
} from "@/modules/growth-intelligence/action-effectiveness";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const requestSchema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  actionItemId: z.uuid(),
  metricId: z.string().trim().min(1).max(120),
  currency: z.string().trim().min(1).max(12).optional().nullable(),
  baselineFrom: z.iso.datetime({ offset: true }),
  baselineTo: z.iso.datetime({ offset: true }),
  evaluationFrom: z.iso.datetime({ offset: true }),
  evaluationTo: z.iso.datetime({ offset: true }),
}).strict();

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
    const body = requestSchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);

    const record = await evaluateCompletedGrowthAction(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant,
        actionItemId: body.actionItemId,
        metricId: body.metricId,
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        baselineFrom: new Date(body.baselineFrom),
        baselineTo: new Date(body.baselineTo),
        evaluationFrom: new Date(body.evaluationFrom),
        evaluationTo: new Date(body.evaluationTo),
      },
    );

    return Response.json(serialize(record), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "growth_action_effectiveness_forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (error instanceof ActionEffectivenessNotFoundError) {
      return Response.json({ error: "growth_action_not_found" }, { status: 404 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof ActionEffectivenessValidationError
    ) {
      return Response.json({ error: "invalid_action_effectiveness" }, { status: 400 });
    }
    return Response.json({ error: "action_effectiveness_unavailable" }, { status: 503 });
  }
}

function serialize(record: Awaited<ReturnType<typeof evaluateCompletedGrowthAction>>) {
  return {
    ...record,
    baselineFrom: record.baselineFrom.toISOString(),
    baselineTo: record.baselineTo.toISOString(),
    evaluationFrom: record.evaluationFrom.toISOString(),
    evaluationTo: record.evaluationTo.toISOString(),
    recordedAt: record.recordedAt.toISOString(),
  };
}
