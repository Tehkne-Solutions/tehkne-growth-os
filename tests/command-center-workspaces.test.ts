import { describe, expect, it, vi } from "vitest";
import { listAuthorizedCommandCenterWorkspaces } from "@/modules/command-center/workspaces";
import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";

const operatorOrganizationId = "11111111-1111-4111-8111-111111111111";

describe("command center workspace discovery", () => {
  it("queries only scopes that grant command center read", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const authorizationStore = {
      listActiveMemberships: vi.fn().mockResolvedValue([
        {
          id: "membership-client",
          scope: "CLIENT",
          operatorOrganizationId,
          clientOrganizationId: "22222222-2222-4222-8222-222222222222",
          permissionKeys: [COMMAND_CENTER_PERMISSIONS.read],
        },
        {
          id: "membership-denied",
          scope: "WORKSPACE",
          operatorOrganizationId,
          clientOrganizationId: "22222222-2222-4222-8222-222222222222",
          workspaceId: "33333333-3333-4333-8333-333333333333",
          permissionKeys: [],
        },
      ]),
      getRolePermissionsForGrant: vi.fn(),
      recordAuthorizationDenial: vi.fn(),
    };

    await listAuthorizedCommandCenterWorkspaces(
      {
        database: { workspace: { findMany } } as never,
        authorizationStore,
      },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        operatorOrganizationId,
      },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          operatorOrganizationId,
          status: "ACTIVE",
          OR: [
            {
              operatorOrganizationId,
              clientOrganizationId: "22222222-2222-4222-8222-222222222222",
            },
          ],
        }),
      }),
    );
  });

  it("does not query workspace table when no membership grants read", async () => {
    const findMany = vi.fn();
    const authorizationStore = {
      listActiveMemberships: vi.fn().mockResolvedValue([]),
      getRolePermissionsForGrant: vi.fn(),
      recordAuthorizationDenial: vi.fn(),
    };

    const result = await listAuthorizedCommandCenterWorkspaces(
      {
        database: { workspace: { findMany } } as never,
        authorizationStore,
      },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        operatorOrganizationId,
      },
    );

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
