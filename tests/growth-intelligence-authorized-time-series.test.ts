import { describe, expect, it, vi } from "vitest";

import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { loadAuthorizedInterpretedCommandCenterIntelligence } from "@/modules/growth-intelligence/authorized-intelligence";

const tenant = {
  operatorOrganizationId: "11111111-1111-4111-8111-111111111111",
  clientOrganizationId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
} as const;

describe("authorized growth time series", () => {
  it("uses the authorized workspace for every historical window", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { metricId: "leads", currency: null, _sum: { value: 10 } },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = {
      metricObservation: { groupBy },
      growthEvent: { count },
      metricImportBatch: { findFirst },
    } as never;
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

    const result = await loadAuthorizedInterpretedCommandCenterIntelligence(
      { database, authorizationStore },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        tenant,
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
      },
    );

    expect(authorizationStore.listActiveMemberships).toHaveBeenCalledOnce();
    expect(groupBy).toHaveBeenCalledTimes(6);
    for (const call of groupBy.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: tenant.workspaceId }),
        }),
      );
    }
    expect(result.timeSeries[0]?.points).toHaveLength(6);
  });
});
