import { cookies } from "next/headers";

import {
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

export async function GET() {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(
      getSessionCookieName(environment.NODE_ENV),
    )?.value;
    if (!token) throw new InvalidSessionError();

    const session = await validateSession(
      new PrismaIdentityRepository(getDatabase()),
      token,
      secret,
    );
    return Response.json(
      { authenticated: true, userId: session.userId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ authenticated: false }, { status: 401 });
    }
    return Response.json({ error: "identity_unavailable" }, { status: 503 });
  }
}
