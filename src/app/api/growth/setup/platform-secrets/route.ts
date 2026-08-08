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
  assertPlatformConnectorSecretManager,
  configurePlatformConnectorSecret,
  inspectPlatformConnectorSecrets,
  platformConnectorSecretRefsFromEnvironment,
} from "@/modules/growth-onboarding/platform-connector-secrets";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const operatorQuerySchema = z.object({
  operatorOrganizationId: z.uuid(),
}).strict();

const requestSchema = z.discriminatedUnion("kind", [
  z.object({
    operatorOrganizationId: z.uuid(),
    kind: z.literal("GOOGLE_ADS_DEVELOPER_TOKEN"),
    developerToken: z.string().trim().min(8).max(1000),
  }).strict(),
  z.object({
    operatorOrganizationId: z.uuid(),
    kind: z.literal("GOOGLE_ADS_OAUTH_CLIENT"),
    clientId: z.string().trim().min(3).max(500),
    clientSecret: z.string().trim().min(8).max(4096),
  }).strict(),
  z.object({
    operatorOrganizationId: z.uuid(),
    kind: z.literal("META_ADS_OAUTH_CLIENT"),
    clientId: z.string().trim().min(3).max(500),
    clientSecret: z.string().trim().min(8).max(4096),
  }).strict(),
]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = operatorQuerySchema.parse({
      operatorOrganizationId: url.searchParams.get("operatorOrganizationId"),
    });
    const context = await authenticatedPlatformSecretContext(query.operatorOrganizationId);
    const refs = platformConnectorSecretRefsFromEnvironment(process.env);
    const status = await inspectPlatformConnectorSecrets(
      context.database,
      context.masterKey,
      refs,
    );
    return Response.json(
      { status, signature: "Tehkné Solutions" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return platformSecretErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const body = requestSchema.parse(await request.json());
    const context = await authenticatedPlatformSecretContext(
      body.operatorOrganizationId,
      environment,
    );
    const requestId =
      request.headers.get("x-request-id") ??
      request.headers.get("x-vercel-id") ??
      null;

    const secret = body.kind === "GOOGLE_ADS_DEVELOPER_TOKEN"
      ? { kind: body.kind, developerToken: body.developerToken }
      : {
          kind: body.kind,
          clientId: body.clientId,
          clientSecret: body.clientSecret,
        };
    const result = await configurePlatformConnectorSecret(
      context.database,
      context.masterKey,
      {
        operatorOrganizationId: body.operatorOrganizationId,
        actorUserId: context.userId,
        secret,
        refs: platformConnectorSecretRefsFromEnvironment(process.env),
        requestId,
      },
    );

    return Response.json(
      {
        configured: true,
        kind: result.kind,
        secretRef: result.secretRef,
        rotated: result.rotated,
        signature: "Tehkné Solutions",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return platformSecretErrorResponse(error);
  }
}

async function authenticatedPlatformSecretContext(
  operatorOrganizationId: string,
  environment = parseServerEnvironment(process.env),
) {
  const sessionSecret = requireSessionSecret(environment);
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
  if (!token) throw new InvalidSessionError();

  const database = getDatabase();
  const repository = new PrismaIdentityRepository(database);
  const session = await validateSession(repository, token, sessionSecret);
  await assertPlatformConnectorSecretManager(repository, {
    userId: session.userId,
    operatorOrganizationId,
  });

  const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
  if (!masterKey) throw new PlatformConnectorSecretConfigurationError();

  return {
    database,
    masterKey,
    userId: session.userId,
  } as const;
}

function platformSecretErrorResponse(error: unknown): Response {
  if (error instanceof InvalidSessionError) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    return Response.json({ error: "platform_secret_manage_forbidden" }, { status: 403 });
  }
  if (error instanceof InvalidRequestOriginError) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return Response.json({ error: "invalid_platform_secret_request" }, { status: 400 });
  }
  if (error instanceof PlatformConnectorSecretConfigurationError) {
    return Response.json({ error: "platform_secret_vault_not_configured" }, { status: 503 });
  }
  console.error("Platform connector secret operation failed", error);
  return Response.json({ error: "platform_secret_operation_unavailable" }, { status: 503 });
}

class PlatformConnectorSecretConfigurationError extends Error {}
