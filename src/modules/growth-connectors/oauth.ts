import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@/shared/db/client";

import type { SecretProvider } from "./secret-provider";
import type { ConnectorProvider } from "./types";

export type OAuthProviderConfiguration = Readonly<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientSecretRef: string;
  scopes: readonly string[];
  extraAuthorizationParams?: Readonly<Record<string, string>>;
}>;

export type OAuthAttempt = Readonly<{
  attemptId: string;
  authorizationUrl: string;
  state: string;
  expiresAt: Date;
}>;

export type ConsumedOAuthAttempt = Readonly<{
  attemptId: string;
  workspaceId: string;
  provider: ConnectorProvider;
  redirectUri: string;
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
}>;

export class OAuthConfigurationError extends Error {}
export class OAuthStateValidationError extends Error {}

export async function createOAuthAttempt(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    workspaceId: string;
    userId: string;
    provider: ConnectorProvider;
    redirectUri: string;
    configuration: OAuthProviderConfiguration;
    now?: Date;
    ttlMinutes?: number;
  }>,
): Promise<OAuthAttempt> {
  const credentials = await dependencies.secrets.get(input.configuration.clientSecretRef);
  const clientId = credentials?.clientId;
  if (!clientId) throw new OAuthConfigurationError("OAuth clientId is unavailable.");

  const attemptId = randomUUID();
  const state = randomBytes(32).toString("base64url");
  const stateHash = sha256(state);
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = sha256Base64Url(codeVerifier);
  const pkceSecretRef = `growth-connectors/oauth/${attemptId}/pkce`;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMinutes ?? 10) * 60_000);

  await dependencies.secrets.put(pkceSecretRef, { codeVerifier });
  try {
    await dependencies.database.$executeRaw`
      INSERT INTO growth_connector_oauth_attempts (
        id, workspace_id, provider, state_hash, pkce_secret_ref,
        redirect_uri, created_by_user_id, expires_at, created_at
      ) VALUES (
        ${attemptId}::uuid, ${input.workspaceId}::uuid, ${input.provider}, ${stateHash}, ${pkceSecretRef},
        ${input.redirectUri}, ${input.userId}::uuid, ${expiresAt}, ${now}
      )
    `;
  } catch (error) {
    await dependencies.secrets.delete(pkceSecretRef);
    throw error;
  }

  const url = new URL(input.configuration.authorizationEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.configuration.scopes.length > 0) {
    url.searchParams.set("scope", input.configuration.scopes.join(" "));
  }
  for (const [key, value] of Object.entries(input.configuration.extraAuthorizationParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return { attemptId, authorizationUrl: url.toString(), state, expiresAt };
}

export async function consumeOAuthAttempt(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    state: string;
    userId: string;
    configuration: OAuthProviderConfiguration;
    now?: Date;
  }>,
): Promise<ConsumedOAuthAttempt> {
  const now = input.now ?? new Date();
  const stateHash = sha256(input.state);
  const rows = await dependencies.database.$queryRaw<Array<{
    attemptId: string;
    workspaceId: string;
    provider: ConnectorProvider;
    pkceSecretRef: string;
    redirectUri: string;
  }>>`
    UPDATE growth_connector_oauth_attempts
    SET consumed_at = ${now}
    WHERE state_hash = ${stateHash}
      AND created_by_user_id = ${input.userId}::uuid
      AND consumed_at IS NULL
      AND expires_at > ${now}
    RETURNING id AS "attemptId", workspace_id AS "workspaceId", provider,
      pkce_secret_ref AS "pkceSecretRef", redirect_uri AS "redirectUri"
  `;
  const attempt = rows[0];
  if (!attempt) throw new OAuthStateValidationError("OAuth state is invalid, expired, already consumed, or belongs to another user.");

  const [pkce, credentials] = await Promise.all([
    dependencies.secrets.get(attempt.pkceSecretRef),
    dependencies.secrets.get(input.configuration.clientSecretRef),
  ]);
  const codeVerifier = pkce?.codeVerifier;
  const clientId = credentials?.clientId;
  const clientSecret = credentials?.clientSecret;
  await dependencies.secrets.delete(attempt.pkceSecretRef);

  if (!codeVerifier || !clientId || !clientSecret) {
    throw new OAuthConfigurationError("OAuth secret material is unavailable.");
  }

  return {
    attemptId: attempt.attemptId,
    workspaceId: attempt.workspaceId,
    provider: attempt.provider,
    redirectUri: attempt.redirectUri,
    codeVerifier,
    tokenEndpoint: input.configuration.tokenEndpoint,
    clientId,
    clientSecret,
  };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
