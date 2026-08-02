import { describe, expect, it, vi } from "vitest";

import { loadAuthorizedCommandCenterIntelligence } from "@/modules/command-center/authorized-query";
import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";

const tenant = {
  operatorOrganizationId: "11111111-1111-4111-8111-111111111111",
  clientOrganizationId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
} as const;

describe("authorized command center intelligence", () => {
  it("authorizes once and loads current and previous snapshots for the same workspace", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        { metricId: "leads", currency: null, _sum: { value: 120 } },
      ])
      .mockResolvedValueOnce([
        { metricId: "leads", currency: null, _sum: { value: 100 } },
      ]);
    const count = vi.fn().mockResolvedValueOnce(30).mockResolvedValueOnce(20);
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

    const result = await loadAuthorizedCommandCenterIntelligence(
      { database, authorizationStore },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        tenant,
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-08-31T23:59:59.999Z"),
      },
    );

    expect(authorizationStore.listActiveMemberships).toHaveBeenCalledOnce();
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: tenant.workspaceId }),
      }),
    );
    expect(groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: tenant.workspaceId }),
      }),
    );
    expect(result.metrics[0]).toMatchObject({
      metricId: "leads",
      currentValue: 120,
      previousValue: 100,
      percentageDelta: 20,
      trend: "up",
    });
    expect(result.eventCount.percentageDelta).toBe(50);
  });
});
