import { describe, expect, it } from "vitest";

import {
  authorize,
  authorizeRoleGrant,
  AuthorizationDeniedError,
  buildAuthorizationContext,
  membershipCoversTenant,
} from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext } from "@/modules/tenancy";

const ids = {
  operator: "8ecbb057-70d7-4b22-b814-8c6abc2d1bcb",
  otherOperator: "2a405547-97ba-44aa-8cfa-d13c77391b94",
  client: "d0a5c149-bd54-4093-b184-02f8343e06d0",
  brand: "3f7ee36c-1ad3-4ec8-ae4e-f2f23f38dc2c",
  workspace: "de90d598-f75a-4fb5-912b-b8a3ade1b8a1",
};

const tenant = parseTenantContext({
  operatorOrganizationId: ids.operator,
  clientOrganizationId: ids.client,
  brandId: ids.brand,
  workspaceId: ids.workspace,
});

describe("hierarchical RBAC", () => {
  it("lets an operator membership cover a descendant workspace", () => {
    expect(
      membershipCoversTenant(
        {
          id: "membership-1",
          scope: "OPERATOR",
          operatorOrganizationId: ids.operator,
          permissionKeys: ["campaigns.read"],
        },
        tenant,
      ),
    ).toBe(true);
  });

  it("never lets a membership cross the operator boundary", () => {
    expect(
      membershipCoversTenant(
        {
          id: "membership-2",
          scope: "OPERATOR",
          operatorOrganizationId: ids.otherOperator,
          permissionKeys: ["campaigns.read"],
        },
        tenant,
      ),
    ).toBe(false);
  });

  it("combines permissions only from memberships covering the tenant", () => {
    const context = buildAuthorizationContext("user-1", tenant, [
      {
        id: "operator-membership",
        scope: "OPERATOR",
        operatorOrganizationId: ids.operator,
        permissionKeys: ["clients.read"],
      },
      {
        id: "workspace-membership",
        scope: "WORKSPACE",
        operatorOrganizationId: ids.operator,
        clientOrganizationId: ids.client,
        workspaceId: ids.workspace,
        permissionKeys: ["campaigns.write"],
      },
      {
        id: "foreign-membership",
        scope: "OPERATOR",
        operatorOrganizationId: ids.otherOperator,
        permissionKeys: ["dangerous.permission"],
      },
    ]);

    expect([...context.permissions].sort()).toEqual([
      "campaigns.write",
      "clients.read",
    ]);
    expect(context.permissions.has("dangerous.permission")).toBe(false);
    expect("add" in context.permissions).toBe(false);
  });

  it("records a denial without granting an absent permission", async () => {
    const denials: string[] = [];
    const store: AuthorizationMembershipStore = {
      async listActiveMemberships() {
        return [];
      },
      async getRolePermissionsForGrant() {
        return [];
      },
      async recordAuthorizationDenial(input) {
        denials.push(input.permission);
      },
    };

    await expect(
      authorize(store, {
        userId: "user-1",
        tenant,
        permission: "campaigns.write",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denials).toEqual(["campaigns.write"]);
  });

  it("blocks granting a role with permissions the inviter does not have", async () => {
    const denials: string[] = [];
    const store: AuthorizationMembershipStore = {
      async listActiveMemberships() {
        return [];
      },
      async getRolePermissionsForGrant() {
        return ["campaigns.write", "budgets.manage"];
      },
      async recordAuthorizationDenial(input) {
        denials.push(input.permission);
      },
    };
    const context = buildAuthorizationContext("user-1", tenant, [
      {
        id: "membership-1",
        scope: "OPERATOR",
        operatorOrganizationId: ids.operator,
        permissionKeys: ["campaigns.write"],
      },
    ]);

    await expect(
      authorizeRoleGrant(store, { context, roleId: "role-admin" }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(denials).toEqual(["identity.roles.grant:role-admin"]);
  });
});
