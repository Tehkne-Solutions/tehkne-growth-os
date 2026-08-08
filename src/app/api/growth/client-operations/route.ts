import { cookies } from "next/headers";
import { z } from "zod";

import {
  ClientOperationsProfileNotFoundError,
  ClientOperationsValidationError,
  ClientOperationsWorkspaceRequiredError,
  CLIENT_LIFECYCLE_STATES,
  saveClientOperationsProfile,
  transitionClientLifecycle,
} from "@/modules/client-operations/client-profile";
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
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const saveProfileSchema = z.object({
  intent: z.literal("save_profile"),
  tenant: tenantSchema,
  primaryBusinessObjective: z.string().max(1000).optional().nullable(),
  northStarMetricId: z.string().max(120).optional().nullable(),
  financialCurrency: z.string().trim().length(3),
  averageTicket: z.number().finite().nonnegative().optional().nullable(),
  monthlyMediaBudget: z.number().finite().nonnegative().optional().nullable(),
  salesCycleDays: z.number().int().nonnegative().optional().nullable(),
  capacityNotes: z.string().max(5000).optional().nullable(),
  seasonalityNotes: z.string().max(5000).optional().nullable(),
  handoverSource: z.string().max(120).optional().nullable(),
}).strict();

const transitionSchema = z.object({
  intent: z.literal("transition"),
  tenant: tenantSchema,
  toState: z.enum(CLIENT_LIFECYCLE_STATES),
  reason: z.string().trim().min(3).max(1000),
}).strict();

const requestSchema = z.discriminatedUnion("intent", [saveProfileSchema, transitionSchema]);

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

    const profile = body.intent === "save_profile"
      ? await saveClientOperationsProfile(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            primaryBusinessObjective: body.primaryBusinessObjective,
            northStarMetricId: body.northStarMetricId,
            financialCurrency: body.financialCurrency,
            averageTicket: body.averageTicket,
            monthlyMediaBudget: body.monthlyMediaBudget,
            salesCycleDays: body.salesCycleDays,
            capacityNotes: body.capacityNotes,
            seasonalityNotes: body.seasonalityNotes,
            handoverSource: body.handoverSource,
          },
        )
      : await transitionClientLifecycle(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            toState: body.toState,
            reason: body.reason,
          },
        );

    return Response.json(serializeProfile(profile), {
      status: body.intent === "save_profile" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "client_operations_forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (error instanceof ClientOperationsProfileNotFoundError) {
      return Response.json({ error: "client_profile_not_found" }, { status: 404 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof ClientOperationsValidationError ||
      error instanceof ClientOperationsWorkspaceRequiredError
    ) {
      return Response.json({ error: "invalid_client_operations_request" }, { status: 400 });
    }
    return Response.json({ error: "client_operations_unavailable" }, { status: 503 });
  }
}

function serializeProfile(profile: Awaited<ReturnType<typeof saveClientOperationsProfile>>) {
  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
