import { AuthorizationDeniedError } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import type { AuthorizationMembership } from "@/modules/identity";
import {
  PostgresEncryptedSecretProvider,
  type SecretPayload,
} from "@/modules/growth-connectors/secret-provider";
import type { DatabaseClient } from "@/shared/db/client";

export const PLATFORM_CONNECTOR_SECRET_REFS = Object.freeze({
  googleAdsDeveloperToken: "growth-connectors/platform/google-ads/developer-token",
  googleAdsOAuthClient: "growth-connectors/platform/google-ads/oauth-client",
  metaAdsOAuthClient: "growth-connectors/platform/meta-ads/oauth-client",
} as const);

export type PlatformConnectorSecretRefs = Readonly<{
  googleAdsDeveloperToken: string;
  googleAdsOAuthClient: string;
  metaAdsOAuthClient: string;
}>;

export type PlatformConnectorSecretKind =
  | "GOOGLE_ADS_DEVELOPER_TOKEN"
  | "GOOGLE_ADS_OAUTH_CLIENT"
  | "META_ADS_OAUTH_CLIENT";

export type PlatformConnectorSecretStatus = Readonly<{
  googleAdsDeveloperToken: boolean;
  googleAdsOAuthClient: boolean;
  metaAdsOAuthClient: boolean;
}>;

export type PlatformConnectorSecretInput =
  | Readonly<{
      kind: "GOOGLE_ADS_DEVELOPER_TOKEN";
      developerToken: string;
    }>
  | Readonly<{
      kind: "GOOGLE_ADS_OAUTH_CLIENT" | "META_ADS_OAUTH_CLIENT";
      clientId: string;
      clientSecret: string;
    }>;

const PLATFORM_SECRET_AUDIT_PERMISSION = "growth.platform_secrets.manage";
const REQUIRED_OPERATOR_PERMISSIONS = Object.freeze([
  "identity.roles.assign_any",
  "growth.connectors.manage",
]);

export function platformConnectorSecretRefsFromEnvironment(
  environment: NodeJS.ProcessEnv,
): PlatformConnectorSecretRefs {
  return Object.freeze({
    googleAdsDeveloperToken:
      environment.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF?.trim() ||
      PLATFORM_CONNECTOR_SECRET_REFS.googleAdsDeveloperToken,
    googleAdsOAuthClient:
      environment.GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF?.trim() ||
      PLATFORM_CONNECTOR_SECRET_REFS.googleAdsOAuthClient,
    metaAdsOAuthClient:
      environment.META_ADS_OAUTH_CLIENT_SECRET_REF?.trim() ||
      PLATFORM_CONNECTOR_SECRET_REFS.metaAdsOAuthClient,
  });
}

export async function canManagePlatformConnectorSecrets(
  store: AuthorizationMembershipStore,
  input: Readonly<{ userId: string; operatorOrganizationId: string }>,
): Promise<boolean> {
  const memberships = await store.listActiveMemberships(
    input.userId,
    input.operatorOrganizationId,
  );
  return memberships.some(isPlatformSecretManagerMembership);
}

export async function assertPlatformConnectorSecretManager(
  store: AuthorizationMembershipStore,
  input: Readonly<{ userId: string; operatorOrganizationId: string }>,
): Promise<void> {
  if (await canManagePlatformConnectorSecrets(store, input)) return;

  await store.recordAuthorizationDenial({
    userId: input.userId,
    permission: PLATFORM_SECRET_AUDIT_PERMISSION,
    operatorOrganizationId: input.operatorOrganizationId,
    clientOrganizationId: null,
    workspaceId: null,
    occurredAt: new Date(),
  });
  throw new AuthorizationDeniedError();
}

export async function inspectPlatformConnectorSecrets(
  database: DatabaseClient,
  masterKey: string,
  refs: PlatformConnectorSecretRefs = PLATFORM_CONNECTOR_SECRET_REFS,
): Promise<PlatformConnectorSecretStatus> {
  const secrets = new PostgresEncryptedSecretProvider(database, masterKey);
  const [developerToken, googleOAuth, metaOAuth] = await Promise.all([
    secrets.get(refs.googleAdsDeveloperToken),
    secrets.get(refs.googleAdsOAuthClient),
    secrets.get(refs.metaAdsOAuthClient),
  ]);

  return Object.freeze({
    googleAdsDeveloperToken: validDeveloperToken(developerToken),
    googleAdsOAuthClient: validOAuthClient(googleOAuth),
    metaAdsOAuthClient: validOAuthClient(metaOAuth),
  });
}

export async function configurePlatformConnectorSecret(
  database: DatabaseClient,
  masterKey: string,
  input: Readonly<{
    operatorOrganizationId: string;
    actorUserId: string;
    secret: PlatformConnectorSecretInput;
    refs?: PlatformConnectorSecretRefs;
    requestId?: string | null;
  }>,
): Promise<Readonly<{ kind: PlatformConnectorSecretKind; secretRef: string; rotated: boolean }>> {
  const descriptor = describeSecret(
    input.secret,
    input.refs ?? PLATFORM_CONNECTOR_SECRET_REFS,
  );

  return database.$transaction(async (transaction) => {
    const secrets = new PostgresEncryptedSecretProvider(transaction, masterKey);
    const previous = await secrets.get(descriptor.secretRef);
    const rotated = previous !== null;

    await secrets.put(descriptor.secretRef, descriptor.payload);
    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: input.operatorOrganizationId,
        actorUserId: input.actorUserId,
        action: rotated
          ? "growth.platform_secret.rotate"
          : "growth.platform_secret.configure",
        resourceType: "platform_connector_secret",
        resourceId: input.secret.kind,
        requestId: input.requestId ?? null,
        metadata: {
          kind: input.secret.kind,
          secretRef: descriptor.secretRef,
          rotated,
          signature: "Tehkné Solutions",
        },
      },
    });

    return Object.freeze({
      kind: input.secret.kind,
      secretRef: descriptor.secretRef,
      rotated,
    });
  });
}

function isPlatformSecretManagerMembership(
  membership: AuthorizationMembership,
): boolean {
  return (
    membership.scope === "OPERATOR" &&
    REQUIRED_OPERATOR_PERMISSIONS.every((permission) =>
      membership.permissionKeys.includes(permission),
    )
  );
}

function describeSecret(
  secret: PlatformConnectorSecretInput,
  refs: PlatformConnectorSecretRefs,
): Readonly<{
  secretRef: string;
  payload: SecretPayload;
}> {
  switch (secret.kind) {
    case "GOOGLE_ADS_DEVELOPER_TOKEN":
      return {
        secretRef: refs.googleAdsDeveloperToken,
        payload: { developerToken: secret.developerToken },
      };
    case "GOOGLE_ADS_OAUTH_CLIENT":
      return {
        secretRef: refs.googleAdsOAuthClient,
        payload: { clientId: secret.clientId, clientSecret: secret.clientSecret },
      };
    case "META_ADS_OAUTH_CLIENT":
      return {
        secretRef: refs.metaAdsOAuthClient,
        payload: { clientId: secret.clientId, clientSecret: secret.clientSecret },
      };
  }
}

function validDeveloperToken(payload: SecretPayload | null): boolean {
  return typeof payload?.developerToken === "string" && payload.developerToken.trim().length > 0;
}

function validOAuthClient(payload: SecretPayload | null): boolean {
  return (
    typeof payload?.clientId === "string" &&
    payload.clientId.trim().length > 0 &&
    typeof payload?.clientSecret === "string" &&
    payload.clientSecret.trim().length > 0
  );
}
