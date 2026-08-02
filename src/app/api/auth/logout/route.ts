import { cookies } from "next/headers";

import { PrismaIdentityRepository, revokeSession } from "@/modules/identity";
import {
  assertSameOrigin,
  getSessionCookieName,
  InvalidRequestOriginError,
} from "@/modules/identity/http/security";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);

    const cookieStore = await cookies();
    const cookieName = getSessionCookieName(environment.NODE_ENV);
    const token = cookieStore.get(cookieName)?.value;

    if (token) {
      await revokeSession(
        new PrismaIdentityRepository(getDatabase()),
        token,
        secret,
      );
    }
    cookieStore.delete(cookieName);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    return Response.json({ error: "identity_unavailable" }, { status: 503 });
  }
}
