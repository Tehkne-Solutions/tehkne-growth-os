import { describe, expect, it, vi } from "vitest";
import { AuthorizationDeniedError } from "@/modules/identity";
import {
  CommandCenterWorkspaceRequiredError,
  loadAuthorizedCommandCenterSnapshot,
} from "@/modules/command-center/authorized-query";
import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";

const tenant = {
  operatorOrganizationId: "11111111-1111-4111-8111-111111111111",
  clientOrganizationId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
} as const;

function createDatabase() {
  return {
    metricObservation: {
      groupBy: vi.fn().mockResolvedValue([
        { metricId: "leads", currency: null, _sum: { value: 9 } },
      ]),
    },
    growthEvent: { count: vi.fn().mockResolvedValue(2) },
    metricImportBatch: { findFirst: vi.fn().mockResolvedValue(null) },
  } as never;
}

describe("authorized command center query", () => {
  it("queries only after a covering membership grants command center read", async () => {
    const database = createDatabase();
    const authorizationStore = {
      listActiveMemberships: vi.fn().mockResolvedValue([
        {
          id: "membership-1",
          scope: "WORKSPACE",
          operatorOrganizationId: tenant.operatorOrganizationId,
          clientOrganizationId: tenant.clientOrganizationId,
          workspaceId: tenant.workspaceId,
          permissionKeys: [COMMAND_CENTER_PERMISSIONS.read],
        },
      ]),
      getRolePermissionsForGrant: vi.fn(),
      recordAuthorizationDenial: vi.fn(),
    };

    const snapshot = await loadAuthorizedCommandCenterSnapshot(
      { database, authorizationStore },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        tenant,
        from: new Date("2026-08-01T00:00:00Z"),
        to: new Date("2026-08-31T23:59:59Z"),
      },
    );

    expect(snapshot.workspaceId).toBe(tenant.workspaceId);
    expect(database.metricObservation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: tenant.workspaceId }),
      }),
    );
    expect(authorizationStore.recordAuthorizationDenial).not.toHaveBeenCalled();
  });

  it("denies access before any growth query when permission is absent", async () => {
    const database = createDatabase();
    const authorizationStore = {
      listActiveMemberships: vi.fn().mockResolvedValue([]),
      getRolePermissionsForGrant: vi.fn(),
      recordAuthorizationDenial: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      loadAuthorizedCommandCenterSnapshot(
        { database, authorizationStore },
        {
          userId: "44444444-4444-4444-8444-444444444444",
          tenant,
          from: new Date("2026-08-01T00:00:00Z"),
          to: new Date("2026-08-31T23:59:59Z"),
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(database.metricObservation.groupBy).not.toHaveBeenCalled();
    expect(database.growthEvent.count).not.toHaveBeenCalled();
    expect(authorizationStore.recordAuthorizationDenial).toHaveBeenCalledOnce();
  });

  it("requires workspace scope before authorization", async () => {
    const authorizationStore = {
      listActiveMemberships: vi.fn(),
      getRolePermissionsForGrant: vi.fn(),
      recordAuthorizationDenial: vi.fn(),
    };

    await expect(
      loadAuthorizedCommandCenterSnapshot(
        { database: createDatabase(), authorizationStore },
        {
          userId: "44444444-4444-4444-8444-444444444444",
          tenant: {
            operatorOrganizationId: tenant.operatorOrganizationId,
            clientOrganizationId: tenant.clientOrganizationId,
          },
          from: new Date("2026-08-01T00:00:00Z"),
          to: new Date("2026-08-31T23:59:59Z"),
        },
      ),
    ).rejects.toBeInstanceOf(CommandCenterWorkspaceRequiredError);

    expect(authorizationStore.listActiveMemberships).not.toHaveBeenCalled();
  });
});
