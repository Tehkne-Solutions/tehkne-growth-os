import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { createOAuthAttempt, type OAuthAttempt, type OAuthProviderConfiguration } from "./oauth";
import type { SecretProvider } from "./secret-provider";
import type { ConnectorProvider } from "./types";

export const GROWTH_CONNECTOR_PERMISSIONS = Object.freeze({
  manage: "growth.connectors.manage",
} as const);

export async function createAuthorizedOAuthAttempt(
  dependencies: Readonly<{
    database: DatabaseClient;
    secrets: SecretProvider;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    provider: ConnectorProvider;
    redirectUri: string;
    configuration: OAuthProviderConfiguration;
  }>,
): Promise<OAuthAttempt> {
  const tenant = parseTenantContext(input.tenant);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new Error("Connector OAuth requires an explicit workspace.");
  }

  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_CONNECTOR_PERMISSIONS.manage,
  });

  return createOAuthAttempt(
    { database: dependencies.database, secrets: dependencies.secrets },
    {
      workspaceId: tenant.workspaceId,
      userId: input.userId,
      provider: input.provider,
      redirectUri: input.redirectUri,
      configuration: input.configuration,
    },
  );
}
