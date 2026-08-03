import { cookies } from "next/headers";
import { z } from "zod";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { assertSameOrigin, getSessionCookieName, InvalidRequestOriginError } from "@/modules/identity/http/security";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import {
  activatePendingPaidMediaAccount,
  GuidedActivationConfigurationError,
  GuidedActivationValidationError,
  guidedActivationEnvironmentFromProcess,
  startPaidMediaActivation,
} from "@/modules/growth-onboarding/guided-activation";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const requestSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("start"),
    tenant: tenantSchema,
    provider: z.enum(["GOOGLE_ADS", "META_ADS"]),
    returnTo: z.string().min(1).max(1800),
  }).strict(),
  z.object({
    intent: z.literal("activate"),
    tenant: tenantSchema,
    attemptId: z.uuid(),
    account: z.object({
      externalAccountId: z.string().min(1).max(180),
      displayName: z.string().min(1).max(240),
      managerAccountId: z.string().min(1).max(180).optional(),
    }).strict(),
  }).strict(),
]);

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = requestSchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);
    const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
    if (!masterKey) throw new GuidedActivationConfigurationError("Connector secret master key is unavailable.");
    const secrets = new PostgresEncryptedSecretProvider(database, masterKey);
    const activationEnvironment = guidedActivationEnvironmentFromProcess(process.env);

    if (body.intent === "start") {
      const result = await startPaidMediaActivation(
        { database, secrets, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          provider: body.provider,
          returnTo: body.returnTo,
          environment: activationEnvironment,
        },
      );
      return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    await authorize(repository, {
      userId: session.userId,
      tenant,
      permission: "growth.connectors.manage",
    });
    const account = {
      externalAccountId: body.account.externalAccountId,
      displayName: body.account.displayName,
      ...(body.account.managerAccountId ? { managerAccountId: body.account.managerAccountId } : {}),
    };
    const result = await activatePendingPaidMediaAccount(
      { database, secrets },
      {
        userId: session.userId,
        workspaceId: body.tenant.workspaceId,
        attemptId: body.attemptId,
        account,
        environment: activationEnvironment,
      },
    );
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "connector_manage_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof GuidedActivationValidationError || error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid_guided_activation" }, { status: 400 });
    }
    if (error instanceof GuidedActivationConfigurationError) {
      return Response.json({ error: "guided_activation_not_configured" }, { status: 503 });
    }
    return Response.json({ error: "guided_activation_unavailable" }, { status: 503 });
  }
}
