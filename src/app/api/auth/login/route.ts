import { cookies } from "next/headers";
import { z } from "zod";

import {
  authenticateWithPassword,
  createSession,
  InvalidCredentialsError,
  PrismaIdentityRepository,
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

const loginSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);

    const input = loginSchema.parse(await request.json());
    const repository = new PrismaIdentityRepository(getDatabase());
    const identity = await authenticateWithPassword(repository, input);
    const session = await createSession(repository, {
      userId: identity.userId,
      secret,
      userAgent: request.headers.get("user-agent"),
      ipPrefix: getIpPrefix(request),
    });
    const cookieStore = await cookies();
    cookieStore.set(
      getSessionCookieName(environment.NODE_ENV),
      session.token,
      getSessionCookieOptions(environment.NODE_ENV, session.expiresAt),
    );

    return Response.json(
      { authenticated: true, userId: identity.userId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
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
