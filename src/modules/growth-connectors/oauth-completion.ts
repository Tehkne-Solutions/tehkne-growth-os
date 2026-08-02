import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@/shared/db/client";

import { consumeOAuthAttempt, type OAuthProviderConfiguration } from "./oauth";
import {
  serializeTokenBundle,
  type ProviderAccount,
  type ReadOnlyProviderAdapter,
} from "./provider-adapters";
import type { SecretProvider } from "./secret-provider";
import type { ConnectorProvider } from "./types";

export type OAuthDiscoveryResult = Readonly<{
  attemptId: string;
  workspaceId: string;
  provider: ConnectorProvider;
  accounts: readonly ProviderAccount[];
}>;

export async function exchangeCodeAndDiscoverAccounts(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    adapter: ReadOnlyProviderAdapter;
  }>,
  input: Readonly<{
    state: string;
    code: string;
    userId: string;
    configuration: OAuthProviderConfiguration;
    now?: Date;
  }>,
): Promise<OAuthDiscoveryResult> {
  const attempt = await consumeOAuthAttempt(
    { database: dependencies.database, secrets: dependencies.secrets },
    {
      state: input.state,
      userId: input.userId,
      configuration: input.configuration,
      ...(input.now ? { now: input.now } : {}),
    },
  );
  if (attempt.provider !== dependencies.adapter.provider) {
    throw new Error("OAuth attempt provider does not match the selected adapter.");
  }

  const tokenBundle = await dependencies.adapter.exchangeAuthorizationCode({
    code: input.code,
    codeVerifier: attempt.codeVerifier,
    redirectUri: attempt.redirectUri,
    clientId: attempt.clientId,
    clientSecret: attempt.clientSecret,
  });
  const tokenSecretRef = `growth-connectors/oauth/${attempt.attemptId}/tokens`;
  await dependencies.secrets.put(tokenSecretRef, serializeTokenBundle(tokenBundle));

  try {
    const accounts = await dependencies.adapter.listAccessibleAccounts({
      provider: attempt.provider,
      tokenSecretRef,
      secrets: dependencies.secrets,
    });
    const completedAt = input.now ?? new Date();
    await dependencies.database.$executeRaw`
      UPDATE growth_connector_oauth_attempts
      SET token_secret_ref = ${tokenSecretRef}, completed_at = ${completedAt}
      WHERE id = ${attempt.attemptId}::uuid
        AND workspace_id = ${attempt.workspaceId}::uuid
    `;
    return {
      attemptId: attempt.attemptId,
      workspaceId: attempt.workspaceId,
      provider: attempt.provider,
      accounts,
    };
  } catch (error) {
    await dependencies.secrets.delete(tokenSecretRef);
    throw error;
  }
}

export async function activateDiscoveredConnectorAccount(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    adapter: ReadOnlyProviderAdapter;
  }>,
  input: Readonly<{
    attemptId: string;
    workspaceId: string;
    userId: string;
    account: ProviderAccount;
    now?: Date;
  }>,
): Promise<Readonly<{ connectionId: string; secretRef: string }>> {
  const rows = await dependencies.database.$queryRaw<Array<{
    provider: ConnectorProvider;
    tokenSecretRef: string | null;
  }>>`
    SELECT provider, token_secret_ref AS "tokenSecretRef"
    FROM growth_connector_oauth_attempts
    WHERE id = ${input.attemptId}::uuid
      AND workspace_id = ${input.workspaceId}::uuid
      AND created_by_user_id = ${input.userId}::uuid
      AND completed_at IS NOT NULL
    LIMIT 1
  `;
  const attempt = rows[0];
  if (!attempt?.tokenSecretRef) throw new Error("OAuth account discovery is not complete.");
  if (attempt.provider !== dependencies.adapter.provider) throw new Error("OAuth provider mismatch.");

  await dependencies.adapter.verifyReadOnlyAccess(
    {
      provider: attempt.provider,
      tokenSecretRef: attempt.tokenSecretRef,
      secrets: dependencies.secrets,
    },
    input.account,
  );

  const pendingTokens = await dependencies.secrets.get(attempt.tokenSecretRef);
  if (!pendingTokens) throw new Error("OAuth token bundle is unavailable.");

  const existing = await dependencies.database.$queryRaw<Array<{
    connectionId: string;
    secretRef: string | null;
  }>>`
    SELECT id AS "connectionId", secret_ref AS "secretRef"
    FROM growth_connector_connections
    WHERE workspace_id = ${input.workspaceId}::uuid
      AND provider = ${attempt.provider}
      AND external_account_id = ${input.account.externalAccountId}
    LIMIT 1
  `;
  const connectionId = existing[0]?.connectionId ?? randomUUID();
  const secretRef = existing[0]?.secretRef ?? `growth-connectors/connections/${connectionId}/tokens`;
  await dependencies.secrets.put(secretRef, pendingTokens);
  const now = input.now ?? new Date();

  try {
    const inserted = await dependencies.database.$queryRaw<Array<{ connectionId: string }>>`
      INSERT INTO growth_connector_connections (
        id, workspace_id, provider, external_account_id, display_name,
        status, secret_ref, created_at, updated_at
      ) VALUES (
        ${connectionId}::uuid, ${input.workspaceId}::uuid, ${attempt.provider},
        ${input.account.externalAccountId}, ${input.account.displayName},
        'ACTIVE', ${secretRef}, ${now}, ${now}
      )
      ON CONFLICT (workspace_id, provider, external_account_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        status = 'ACTIVE',
        secret_ref = EXCLUDED.secret_ref,
        updated_at = EXCLUDED.updated_at
      RETURNING id AS "connectionId"
    `;
    const effectiveConnectionId = inserted[0]?.connectionId;
    if (!effectiveConnectionId) throw new Error("Connector connection could not be persisted.");

    await dependencies.secrets.delete(attempt.tokenSecretRef);
    await dependencies.database.$executeRaw`
      UPDATE growth_connector_oauth_attempts
      SET token_secret_ref = NULL
      WHERE id = ${input.attemptId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
    `;
    return { connectionId: effectiveConnectionId, secretRef };
  } catch (error) {
    if (!existing[0]?.secretRef) await dependencies.secrets.delete(secretRef);
    throw error;
  }
}
