import { randomUUID } from "node:crypto";

import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { createAuthorizedOAuthAttempt } from "@/modules/growth-connectors/authorized-oauth";
import { GoogleAdsAdapter } from "@/modules/growth-connectors/google-ads-adapter";
import { MetaAdsAdapter } from "@/modules/growth-connectors/meta-ads-adapter";
import { activateDiscoveredConnectorAccount, exchangeCodeAndDiscoverAccounts } from "@/modules/growth-connectors/oauth-completion";
import { createOAuthProviderConfiguration } from "@/modules/growth-connectors/oauth-providers";
import { sha256 } from "@/modules/growth-connectors/oauth";
import type { ProviderAccount, ReadOnlyProviderAdapter } from "@/modules/growth-connectors/provider-adapters";
import type { SecretProvider } from "@/modules/growth-connectors/secret-provider";
import { HubSpotCrmAdapter } from "@/modules/growth-crm/hubspot-adapter";
import type { HubSpotAttributionPropertyMap } from "@/modules/growth-crm/types";
import type { TenantContext } from "@/modules/tenancy";
import { resolveApplicationUrl } from "@/shared/config/env";
import type { DatabaseClient } from "@/shared/db/client";

export type PaidMediaActivationProvider = "GOOGLE_ADS" | "META_ADS";

export type GuidedActivationEnvironment = Readonly<{
  appUrl: string;
  googleApiVersion?: string;
  googleDeveloperTokenSecretRef?: string;
  googleOAuthClientSecretRef?: string;
  metaApiVersion?: string;
  metaOAuthClientSecretRef?: string;
}>;

export type PendingPaidMediaActivation = Readonly<{
  attemptId: string;
  provider: PaidMediaActivationProvider;
  accounts: readonly ProviderAccount[];
}>;

export class GuidedActivationConfigurationError extends Error {}
export class GuidedActivationValidationError extends Error {}

export function guidedActivationEnvironmentFromProcess(environment: NodeJS.ProcessEnv): GuidedActivationEnvironment {
  const appUrl = resolveApplicationUrl(environment);
  if (!appUrl) {
    throw new GuidedActivationConfigurationError("APP_URL or Vercel application URL is required for guided activation.");
  }
  return {
    appUrl,
    ...(environment.GOOGLE_ADS_API_VERSION ? { googleApiVersion: environment.GOOGLE_ADS_API_VERSION } : {}),
    ...(environment.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF ? { googleDeveloperTokenSecretRef: environment.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF } : {}),
    ...(environment.GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF ? { googleOAuthClientSecretRef: environment.GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF } : {}),
    ...(environment.META_GRAPH_API_VERSION ? { metaApiVersion: environment.META_GRAPH_API_VERSION } : {}),
    ...(environment.META_ADS_OAUTH_CLIENT_SECRET_REF ? { metaOAuthClientSecretRef: environment.META_ADS_OAUTH_CLIENT_SECRET_REF } : {}),
  };
}

export async function startPaidMediaActivation(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    provider: PaidMediaActivationProvider;
    returnTo: string;
    environment: GuidedActivationEnvironment;
  }>,
): Promise<Readonly<{ authorizationUrl: string; attemptId: string }>> {
  const configuration = providerConfiguration(input.provider, input.environment);
  const redirectUri = `${input.environment.appUrl.replace(/\/$/, "")}/api/growth/setup/paid-media/callback`;
  const attempt = await createAuthorizedOAuthAttempt(dependencies, {
    userId: input.userId,
    tenant: input.tenant,
    provider: input.provider,
    redirectUri,
    configuration,
  });
  const returnTo = normalizeReturnTo(input.returnTo);
  await dependencies.database.$executeRaw`
    UPDATE growth_connector_oauth_attempts
    SET return_to = ${returnTo}
    WHERE id = ${attempt.attemptId}::uuid
  `;
  return { authorizationUrl: attempt.authorizationUrl, attemptId: attempt.attemptId };
}

export async function completePaidMediaActivationCallback(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    userId: string;
    state: string;
    code: string;
    environment: GuidedActivationEnvironment;
  }>,
): Promise<Readonly<{ attemptId: string; workspaceId: string; returnTo: string }>> {
  const stateHash = sha256(input.state);
  const rows = await dependencies.database.$queryRaw<Array<{ provider: PaidMediaActivationProvider; returnTo: string | null }>>`
    SELECT provider, return_to AS "returnTo"
    FROM growth_connector_oauth_attempts
    WHERE state_hash = ${stateHash}
      AND created_by_user_id = ${input.userId}::uuid
      AND consumed_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;
  const candidate = rows[0];
  if (!candidate) throw new GuidedActivationValidationError("OAuth activation state is unavailable.");
  const adapter = paidMediaAdapter(candidate.provider, input.environment);
  const result = await exchangeCodeAndDiscoverAccounts(
    { database: dependencies.database, secrets: dependencies.secrets, adapter },
    {
      state: input.state,
      code: input.code,
      userId: input.userId,
      configuration: providerConfiguration(candidate.provider, input.environment),
    },
  );
  return {
    attemptId: result.attemptId,
    workspaceId: result.workspaceId,
    returnTo: normalizeReturnTo(candidate.returnTo ?? "/command-center/setup"),
  };
}

export async function loadPendingPaidMediaActivation(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    userId: string;
    workspaceId: string;
    attemptId: string;
    environment: GuidedActivationEnvironment;
  }>,
): Promise<PendingPaidMediaActivation | null> {
  const rows = await dependencies.database.$queryRaw<Array<{
    provider: PaidMediaActivationProvider;
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
  if (!attempt?.tokenSecretRef) return null;
  const adapter = paidMediaAdapter(attempt.provider, input.environment);
  const accounts = await adapter.listAccessibleAccounts({
    provider: attempt.provider,
    tokenSecretRef: attempt.tokenSecretRef,
    secrets: dependencies.secrets,
  });
  return { attemptId: input.attemptId, provider: attempt.provider, accounts };
}

export async function activatePendingPaidMediaAccount(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    userId: string;
    workspaceId: string;
    attemptId: string;
    account: ProviderAccount;
    environment: GuidedActivationEnvironment;
  }>,
): Promise<Readonly<{ connectionId: string }>> {
  const rows = await dependencies.database.$queryRaw<Array<{ provider: PaidMediaActivationProvider }>>`
    SELECT provider
    FROM growth_connector_oauth_attempts
    WHERE id = ${input.attemptId}::uuid
      AND workspace_id = ${input.workspaceId}::uuid
      AND created_by_user_id = ${input.userId}::uuid
      AND completed_at IS NOT NULL
    LIMIT 1
  `;
  const provider = rows[0]?.provider;
  if (!provider) throw new GuidedActivationValidationError("Pending OAuth activation was not found.");
  const adapter = paidMediaAdapter(provider, input.environment);
  const result = await activateDiscoveredConnectorAccount(
    { database: dependencies.database, secrets: dependencies.secrets, adapter },
    {
      attemptId: input.attemptId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      account: input.account,
    },
  );
  return { connectionId: result.connectionId };
}

export async function configureHubSpotPrivateApp(
  dependencies: Readonly<{ database: DatabaseClient; secrets: SecretProvider }>,
  input: Readonly<{
    workspaceId: string;
    portalId: string;
    displayName: string;
    accessToken: string;
    attributionProperties: HubSpotAttributionPropertyMap;
    fetchImpl?: typeof fetch;
  }>,
): Promise<Readonly<{ connectionId: string }>> {
  const portalId = input.portalId.trim();
  if (!/^\d+$/.test(portalId)) throw new GuidedActivationValidationError("HubSpot portalId must be numeric.");
  const accessToken = input.accessToken.trim();
  if (accessToken.length < 12) throw new GuidedActivationValidationError("HubSpot access token is invalid.");
  const adapter = new HubSpotCrmAdapter({
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    attributionProperties: input.attributionProperties,
  });
  await adapter.readPage({ accessToken, cursor: null, updatedAfter: null, limit: 1 });

  const existing = await dependencies.database.$queryRaw<Array<{ id: string; secretRef: string | null }>>`
    SELECT id, secret_ref AS "secretRef"
    FROM growth_crm_connections
    WHERE workspace_id = ${input.workspaceId}::uuid
      AND provider = 'HUBSPOT'
      AND external_account_id = ${portalId}
    LIMIT 1
  `;
  const connectionId = existing[0]?.id ?? randomUUID();
  const secretRef = existing[0]?.secretRef ?? `growth-crm/connections/${connectionId}/tokens`;
  await dependencies.secrets.put(secretRef, { accessToken });
  try {
    await dependencies.database.$executeRaw`
      INSERT INTO growth_crm_connections (
        id, workspace_id, provider, external_account_id, display_name,
        status, secret_ref, settings, created_at, updated_at
      ) VALUES (
        ${connectionId}::uuid, ${input.workspaceId}::uuid, 'HUBSPOT', ${portalId},
        ${input.displayName.trim() || `HubSpot ${portalId}`}, 'ACTIVE', ${secretRef},
        ${JSON.stringify({ attributionProperties: input.attributionProperties })}::jsonb, NOW(), NOW()
      )
      ON CONFLICT (workspace_id, provider, external_account_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        status = 'ACTIVE',
        secret_ref = EXCLUDED.secret_ref,
        settings = EXCLUDED.settings,
        consecutive_failures = 0,
        updated_at = NOW()
    `;
  } catch (error) {
    if (!existing[0]?.secretRef) await dependencies.secrets.delete(secretRef);
    throw error;
  }
  return { connectionId };
}

export function normalizeReturnTo(value: string): string {
  if (!value.startsWith("/command-center/setup")) return "/command-center/setup";
  if (value.startsWith("//") || value.includes("\n") || value.includes("\r")) return "/command-center/setup";
  return value;
}

function providerConfiguration(provider: PaidMediaActivationProvider, environment: GuidedActivationEnvironment) {
  if (provider === "GOOGLE_ADS") {
    if (!environment.googleOAuthClientSecretRef) throw new GuidedActivationConfigurationError("Google OAuth client secret ref is missing.");
    return createOAuthProviderConfiguration({ provider, clientSecretRef: environment.googleOAuthClientSecretRef });
  }
  if (!environment.metaOAuthClientSecretRef || !environment.metaApiVersion) {
    throw new GuidedActivationConfigurationError("Meta OAuth configuration is incomplete.");
  }
  return createOAuthProviderConfiguration({
    provider,
    clientSecretRef: environment.metaOAuthClientSecretRef,
    metaApiVersion: environment.metaApiVersion,
  });
}

function paidMediaAdapter(
  provider: PaidMediaActivationProvider,
  environment: GuidedActivationEnvironment,
): ReadOnlyProviderAdapter {
  if (provider === "GOOGLE_ADS") {
    if (!environment.googleApiVersion || !environment.googleDeveloperTokenSecretRef) {
      throw new GuidedActivationConfigurationError("Google Ads API configuration is incomplete.");
    }
    return new GoogleAdsAdapter({
      apiVersion: environment.googleApiVersion,
      developerTokenSecretRef: environment.googleDeveloperTokenSecretRef,
    });
  }
  if (!environment.metaApiVersion) throw new GuidedActivationConfigurationError("Meta Graph API version is missing.");
  return new MetaAdsAdapter({ apiVersion: environment.metaApiVersion });
}
