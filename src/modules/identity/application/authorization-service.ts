import { parseTenantContext, type TenantContext } from "@/modules/tenancy";

import type { AuthorizationMembershipStore } from "./contracts";
import {
  assertPermission,
  assertRoleGrantAllowed,
  AuthorizationDeniedError,
  buildAuthorizationContext,
  type AuthorizationContext,
} from "../domain/authorization";
import { IDENTITY_PERMISSIONS } from "../domain/permissions";

export async function authorize(
  store: AuthorizationMembershipStore,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    permission: string;
  }>,
): Promise<AuthorizationContext> {
  const tenant = parseTenantContext(input.tenant);
  const memberships = await store.listActiveMemberships(
    input.userId,
    tenant.operatorOrganizationId,
  );
  const context = buildAuthorizationContext(input.userId, tenant, memberships);

  try {
    assertPermission(context, input.permission);
  } catch (error) {
    await store.recordAuthorizationDenial({
      userId: input.userId,
      permission: input.permission,
      operatorOrganizationId: tenant.operatorOrganizationId,
      clientOrganizationId: tenant.clientOrganizationId ?? null,
      workspaceId: tenant.workspaceId ?? null,
      occurredAt: new Date(),
    });
    throw error;
  }
  return context;
}

export async function authorizeRoleGrant(
  store: AuthorizationMembershipStore,
  input: Readonly<{
    context: AuthorizationContext;
    roleId: string;
  }>,
): Promise<void> {
  const rolePermissions = await store.getRolePermissionsForGrant(
    input.roleId,
    input.context.tenant.operatorOrganizationId,
  );

  try {
    if (!rolePermissions) {
      throw new Error("Role not found in tenant.");
    }
    assertRoleGrantAllowed(
      input.context,
      rolePermissions,
      IDENTITY_PERMISSIONS.rolesAssignAny,
    );
  } catch (error) {
    await store.recordAuthorizationDenial({
      userId: input.context.userId,
      permission: `identity.roles.grant:${input.roleId}`,
      operatorOrganizationId: input.context.tenant.operatorOrganizationId,
      clientOrganizationId: input.context.tenant.clientOrganizationId ?? null,
      workspaceId: input.context.tenant.workspaceId ?? null,
      occurredAt: new Date(),
    });
    if (error instanceof AuthorizationDeniedError) throw error;
    throw new AuthorizationDeniedError();
  }
}
