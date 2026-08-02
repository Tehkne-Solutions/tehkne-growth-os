import { describe, expect, it } from "vitest";

import {
  assertResourceInTenant,
  parseTenantContext,
  TenantScopeMismatchError,
} from "@/modules/tenancy";

const operatorOrganizationId = "8ecbb057-70d7-4b22-b814-8c6abc2d1bcb";
const clientOrganizationId = "d0a5c149-bd54-4093-b184-02f8343e06d0";
const workspaceId = "de90d598-f75a-4fb5-912b-b8a3ade1b8a1";

describe("tenant context", () => {
  it("accepts an authorized hierarchical scope", () => {
    const context = parseTenantContext({
      operatorOrganizationId,
      clientOrganizationId,
      workspaceId,
    });

    expect(context.workspaceId).toBe(workspaceId);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("rejects a workspace without its client scope", () => {
    expect(() =>
      parseTenantContext({
        operatorOrganizationId,
        workspaceId,
      }),
    ).toThrow("workspaceId requires clientOrganizationId");
  });

  it("denies a resource from another tenant", () => {
    const context = parseTenantContext({
      operatorOrganizationId,
      clientOrganizationId,
      workspaceId,
    });

    expect(() =>
      assertResourceInTenant(context, {
        operatorOrganizationId,
        clientOrganizationId: "7b978c1b-633a-49b5-bc7b-0f44711dd838",
        workspaceId,
      }),
    ).toThrow(TenantScopeMismatchError);
  });
});
