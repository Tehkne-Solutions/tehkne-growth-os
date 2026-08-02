import { cookies } from "next/headers";
import { z } from "zod";

import {
  acceptInvitation,
  createSession,
  ExistingAccountAuthenticationRequiredError,
  InvalidInvitationError,
  InvalidSessionError,
  PasswordPolicyError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import {
  assertSameOrigin,
  getIpPrefix,
  getSessionCookieName,
  getSessionCookieOptions,
  InvalidRequestOriginError,
} from "@/modules/identity/http/security";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const acceptanceSchema = z
  .object({
    token: z.string().min(40).max(100),
    name: z.string().trim().min(2).max(160).optional(),
    password: z.string().min(1).max(128).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);
    const input = acceptanceSchema.parse(await request.json());
    const repository = new PrismaIdentityRepository(getDatabase());
    const cookieStore = await cookies();
    const cookieName = getSessionCookieName(environment.NODE_ENV);
    const currentToken = cookieStore.get(cookieName)?.value;
    let currentUserId: string | null = null;

    if (currentToken) {
      try {
        const currentSession = await validateSession(
          repository,
          currentToken,
          secret,
        );
        currentUserId = currentSession.userId;
      } catch (error) {
        if (!(error instanceof InvalidSessionError)) throw error;
      }
    }

    const accepted = await acceptInvitation(repository, {
      token: input.token,
      secret,
      currentUserId,
      name: input.name ?? null,
      password: input.password ?? null,
    });

    if (accepted.createdUser) {
      const session = await createSession(repository, {
        userId: accepted.userId,
        secret,
        userAgent: request.headers.get("user-agent"),
        ipPrefix: getIpPrefix(request),
      });
      cookieStore.set(
        cookieName,
        session.token,
        getSessionCookieOptions(environment.NODE_ENV, session.expiresAt),
      );
    }

    return Response.json(
      {
        accepted: true,
        userId: accepted.userId,
        membershipId: accepted.membershipId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof InvalidInvitationError ||
      error instanceof ExistingAccountAuthenticationRequiredError
    ) {
      return Response.json({ error: "invalid_invitation" }, { status: 400 });
    }
    if (error instanceof PasswordPolicyError) {
      return Response.json({ error: "password_policy" }, { status: 400 });
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
