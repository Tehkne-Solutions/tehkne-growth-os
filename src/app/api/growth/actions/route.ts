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
  createGrowthActionFromRecommendation,
  GrowthActionNotFoundError,
  GrowthActionValidationError,
  GrowthActionWorkspaceRequiredError,
  transitionGrowthAction,
} from "@/modules/growth-intelligence/action-workflow";
import { parseTenantContext } from "@/modules/tenancy";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const materializeSchema = z.object({
  intent: z.literal("materialize"),
  tenant: tenantSchema,
  recommendationKey: z.string().trim().min(1).max(260),
  responsibleUserId: z.uuid().optional().nullable(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
}).strict();

const transitionSchema = z.object({
  intent: z.literal("transition"),
  tenant: tenantSchema,
  actionId: z.uuid(),
  status: z.enum(["ACCEPTED", "IN_PROGRESS", "COMPLETED", "REJECTED"]),
  responsibleUserId: z.uuid().optional().nullable(),
}).strict();

const requestSchema = z.discriminatedUnion("intent", [materializeSchema, transitionSchema]);

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

    const item = body.intent === "materialize"
      ? await createGrowthActionFromRecommendation(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            recommendationKey: body.recommendationKey,
            ...(body.responsibleUserId === undefined ? {} : { responsibleUserId: body.responsibleUserId }),
            from: new Date(body.from),
            to: new Date(body.to),
          },
        )
      : await transitionGrowthAction(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            actionId: body.actionId,
            status: body.status,
            ...(body.responsibleUserId === undefined ? {} : { responsibleUserId: body.responsibleUserId }),
          },
        );

    return Response.json(serialize(item), {
      status: body.intent === "materialize" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "growth_action_forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (error instanceof GrowthActionNotFoundError) {
      return Response.json({ error: "growth_action_not_found" }, { status: 404 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof GrowthActionWorkspaceRequiredError ||
      error instanceof GrowthActionValidationError
    ) {
      return Response.json({ error: "invalid_growth_action" }, { status: 400 });
    }
    return Response.json({ error: "growth_action_unavailable" }, { status: 503 });
  }
}

function serialize(item: Awaited<ReturnType<typeof createGrowthActionFromRecommendation>>) {
  return {
    ...item,
    acceptedAt: item.acceptedAt?.toISOString() ?? null,
    startedAt: item.startedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    rejectedAt: item.rejectedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
