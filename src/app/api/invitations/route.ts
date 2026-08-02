import { cookies } from "next/headers";
import { z } from "zod";

import {
  authorize,
  authorizeRoleGrant,
  AuthorizationDeniedError,
  createInvitation,
  IDENTITY_PERMISSIONS,
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
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const invitationSchema = z
  .object({
    email: z.email().max(320),
    roleId: z.uuid(),
    scope: z.enum(["OPERATOR", "CLIENT", "BRAND", "WORKSPACE"]),
    tenant: z
      .object({
        operatorOrganizationId: z.uuid(),
        clientOrganizationId: z.uuid().optional(),
        brandId: z.uuid().optional(),
        workspaceId: z.uuid().optional(),
      })
      .strict(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);

    const cookieStore = await cookies();
    const token = cookieStore.get(
      getSessionCookieName(environment.NODE_ENV),
    )?.value;
    if (!token) throw new InvalidSessionError();

    const repository = new PrismaIdentityRepository(getDatabase());
    const session = await validateSession(repository, token, secret);
    const input = invitationSchema.parse(await request.json());
    const tenant = parseTenantContext(input.tenant);
    const authorization = await authorize(repository, {
      userId: session.userId,
      tenant,
      permission: IDENTITY_PERMISSIONS.invitationsCreate,
    });
    await authorizeRoleGrant(repository, {
      context: authorization,
      roleId: input.roleId,
    });
    const invitation = await createInvitation(repository, {
      email: input.email,
      roleId: input.roleId,
      scope: input.scope,
      tenant,
      invitedByUserId: session.userId,
      secret,
    });

    return Response.json(
      {
        id: invitation.id,
        token: invitation.token,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json(
        { error: "authentication_required" },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    return Response.json({ error: "identity_unavailable" }, { status: 503 });
  }
}
