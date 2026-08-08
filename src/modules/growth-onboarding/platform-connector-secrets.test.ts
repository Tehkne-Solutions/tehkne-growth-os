import { describe, expect, it, vi } from "vitest";

import { AuthorizationDeniedError, type AuthorizationMembership } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";

import {
  assertPlatformConnectorSecretManager,
  canManagePlatformConnectorSecrets,
  PLATFORM_CONNECTOR_SECRET_REFS,
} from "./platform-connector-secrets";

const operatorOrganizationId = "91000000-0000-4000-8000-000000000001";
const userId = "90000000-0000-4000-8000-000000000001";

function membership(
  scope: AuthorizationMembership["scope"],
  permissionKeys: readonly string[],
): AuthorizationMembership {
  return {
    id: crypto.randomUUID(),
    scope,
    operatorOrganizationId,
    ...(scope !== "OPERATOR"
      ? { clientOrganizationId: "92000000-0000-4000-8000-000000000001" }
      : {}),
    permissionKeys,
  };
}

function store(memberships: readonly AuthorizationMembership[]) {
  const recordAuthorizationDenial = vi.fn(async () => undefined);
  return {
    implementation: {
      listActiveMemberships: vi.fn(async () => memberships),
      getRolePermissionsForGrant: vi.fn(async () => null),
      recordAuthorizationDenial,
    } satisfies AuthorizationMembershipStore,
    recordAuthorizationDenial,
  };
}

describe("platform connector secret authorization", () => {
  it("requires both privileged permissions on the same OPERATOR membership", async () => {
    const allowed = store([
      membership("OPERATOR", ["identity.roles.assign_any", "growth.connectors.manage"]),
    ]);
    await expect(canManagePlatformConnectorSecrets(allowed.implementation, {
      userId,
      operatorOrganizationId,
    })).resolves.toBe(true);

    const splitAcrossScopes = store([
      membership("OPERATOR", ["identity.roles.assign_any"]),
      membership("CLIENT", ["growth.connectors.manage"]),
    ]);
    await expect(canManagePlatformConnectorSecrets(splitAcrossScopes.implementation, {
      userId,
      operatorOrganizationId,
    })).resolves.toBe(false);
  });

  it("records a denial and fails closed for unauthorized users", async () => {
    const denied = store([
      membership("OPERATOR", ["growth.connectors.manage"]),
    ]);

    await expect(assertPlatformConnectorSecretManager(denied.implementation, {
      userId,
      operatorOrganizationId,
    })).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denied.recordAuthorizationDenial).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      operatorOrganizationId,
      clientOrganizationId: null,
      workspaceId: null,
      permission: "growth.platform_secrets.manage",
    }));
  });

  it("uses fixed platform refs rather than caller-provided secret references", () => {
    expect(PLATFORM_CONNECTOR_SECRET_REFS).toEqual({
      googleAdsDeveloperToken: "growth-connectors/platform/google-ads/developer-token",
      googleAdsOAuthClient: "growth-connectors/platform/google-ads/oauth-client",
      metaAdsOAuthClient: "growth-connectors/platform/meta-ads/oauth-client",
    });
  });
});
