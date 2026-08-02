import { describe, expect, it, vi } from "vitest";

import { AuthorizationDeniedError } from "@/modules/identity";
import {
  MetricGoalValidationError,
  setMetricGoal,
} from "@/modules/growth-intelligence/manage-goals";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";

const tenant = {
  operatorOrganizationId: "11111111-1111-4111-8111-111111111111",
  clientOrganizationId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
} as const;

function authorizationStore(permissionKeys: string[]) {
  return {
    listActiveMemberships: vi.fn().mockResolvedValue([
      {
        id: "membership-1",
        scope: "WORKSPACE",
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        workspaceId: tenant.workspaceId,
        permissionKeys,
      },
    ]),
    getRolePermissionsForGrant: vi.fn(),
    recordAuthorizationDenial: vi.fn().mockResolvedValue(undefined),
  };
}

describe("metric goal management", () => {
  it("denies before querying Growth data when manage permission is absent", async () => {
    const database = {
      metricImportBatch: { findFirst: vi.fn() },
      metricGoal: { findFirst: vi.fn() },
    } as never;
    const store = authorizationStore([]);

    await expect(
      setMetricGoal(
        { database, authorizationStore: store },
        {
          userId: "44444444-4444-4444-8444-444444444444",
          tenant,
          metricId: "leads",
          targetValue: 100,
          validFrom: new Date("2026-08-01T00:00:00Z"),
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect((database as never as { metricImportBatch: { findFirst: ReturnType<typeof vi.fn> } }).metricImportBatch.findFirst).not.toHaveBeenCalled();
  });

  it("rejects metrics outside the committed Sector Pack", async () => {
    const database = {
      metricImportBatch: {
        findFirst: vi.fn().mockResolvedValue({
          sectorPackId: "education",
          sectorPackVersion: "1.0.0",
        }),
      },
      metricGoal: { findFirst: vi.fn() },
    } as never;
    const store = authorizationStore([GROWTH_INTELLIGENCE_PERMISSIONS.manageGoals]);

    await expect(
      setMetricGoal(
        { database, authorizationStore: store },
        {
          userId: "44444444-4444-4444-8444-444444444444",
          tenant,
          metricId: "not_a_metric",
          targetValue: 100,
          validFrom: new Date("2026-08-01T00:00:00Z"),
        },
      ),
    ).rejects.toBeInstanceOf(MetricGoalValidationError);
  });

  it("creates a goal and audit event in one transaction", async () => {
    const createdGoal = {
      id: "55555555-5555-4555-8555-555555555555",
      workspaceId: tenant.workspaceId,
      sectorPackId: "education",
      sectorPackVersion: "1.0.0",
      metricId: "leads",
      currency: null,
      targetValue: 120,
      validFrom: new Date("2026-08-01T00:00:00Z"),
      validTo: null,
    };
    const create = vi.fn().mockResolvedValue(createdGoal);
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const database = {
      metricImportBatch: {
        findFirst: vi.fn().mockResolvedValue({
          sectorPackId: "education",
          sectorPackVersion: "1.0.0",
        }),
      },
      metricGoal: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({
          metricGoal: { create, update: vi.fn() },
          auditEvent: { create: auditCreate },
        }),
      ),
    } as never;
    const store = authorizationStore([GROWTH_INTELLIGENCE_PERMISSIONS.manageGoals]);

    const goal = await setMetricGoal(
      { database, authorizationStore: store },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        tenant,
        metricId: "leads",
        targetValue: 120,
        validFrom: new Date("2026-08-01T00:00:00Z"),
      },
    );

    expect(goal.metricId).toBe("leads");
    expect(create).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});
