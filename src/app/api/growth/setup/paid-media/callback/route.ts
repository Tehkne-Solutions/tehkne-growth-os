import { cookies } from "next/headers";

import {
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import {
  completePaidMediaActivationCallback,
  GuidedActivationConfigurationError,
  GuidedActivationValidationError,
  guidedActivationEnvironmentFromProcess,
} from "@/modules/growth-onboarding/guided-activation";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

export async function GET(request: Request) {
  const environment = parseServerEnvironment(process.env);
  const appUrl = environment.APP_URL.replace(/\/$/, "");
  try {
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || !code) throw new GuidedActivationValidationError("OAuth callback is missing code or state.");

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
    if (!masterKey) throw new GuidedActivationConfigurationError("Connector secret master key is unavailable.");
    const secrets = new PostgresEncryptedSecretProvider(database, masterKey);
    const result = await completePaidMediaActivationCallback(
      { database, secrets },
      {
        userId: session.userId,
        state,
        code,
        environment: guidedActivationEnvironmentFromProcess(process.env),
      },
    );
    const redirect = new URL(result.returnTo, appUrl);
    redirect.searchParams.set("oauthAttemptId", result.attemptId);
    redirect.searchParams.set("activation", "select_account");
    return Response.redirect(redirect, 303);
  } catch (error) {
    const fallback = new URL("/command-center/setup", appUrl);
    fallback.searchParams.set(
      "activationError",
      error instanceof InvalidSessionError
        ? "authentication_required"
        : error instanceof GuidedActivationValidationError
          ? "invalid_oauth_callback"
          : "oauth_callback_unavailable",
    );
    return Response.redirect(fallback, 303);
  }
}
