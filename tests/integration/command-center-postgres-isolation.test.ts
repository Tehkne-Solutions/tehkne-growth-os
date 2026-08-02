import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCommandCenterSnapshot } from "@/modules/command-center/query";
import { getDatabase } from "@/shared/db/client";

const database = getDatabase();

const ids = {
  operator: "10000000-0000-4000-8000-000000000001",
  client: "20000000-0000-4000-8000-000000000001",
  workspaceA: "30000000-0000-4000-8000-000000000001",
  workspaceB: "30000000-0000-4000-8000-000000000002",
} as const;

describe("Command Center PostgreSQL workspace isolation", () => {
  beforeAll(async () => {
    await database.metricObservation.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.growthEvent.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.metricImportBatch.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.workspace.deleteMany({
      where: { id: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.clientOrganization.deleteMany({ where: { id: ids.client } });
    await database.operatorOrganization.deleteMany({ where: { id: ids.operator } });

    await database.operatorOrganization.create({
      data: { id: ids.operator, slug: "ci-operator", name: "CI Operator" },
    });
    await database.clientOrganization.create({
      data: {
        id: ids.client,
        operatorOrganizationId: ids.operator,
        slug: "ci-client",
        name: "CI Client",
      },
    });
    await database.workspace.createMany({
      data: [
        {
          id: ids.workspaceA,
          operatorOrganizationId: ids.operator,
          clientOrganizationId: ids.client,
          slug: "workspace-a",
          name: "Workspace A",
        },
        {
          id: ids.workspaceB,
          operatorOrganizationId: ids.operator,
          clientOrganizationId: ids.client,
          slug: "workspace-b",
          name: "Workspace B",
        },
      ],
    });

    await database.metricObservation.createMany({
      data: [
        {
          workspaceId: ids.workspaceA,
          metricId: "leads",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-08-31T23:59:59.999Z"),
          value: 10,
          source: "integration-test",
        },
        {
          workspaceId: ids.workspaceB,
          metricId: "leads",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-08-31T23:59:59.999Z"),
          value: 999,
          source: "integration-test",
        },
      ],
    });

    await database.growthEvent.createMany({
      data: [
        {
          workspaceId: ids.workspaceA,
          sectorPackId: "growth-services",
          sectorPackVersion: "1.0.0",
          eventType: "lead_created",
          occurredAt: new Date("2026-08-10T12:00:00.000Z"),
          source: "integration-test",
          deduplicationKey: "a".repeat(64),
        },
        {
          workspaceId: ids.workspaceB,
          sectorPackId: "growth-services",
          sectorPackVersion: "1.0.0",
          eventType: "lead_created",
          occurredAt: new Date("2026-08-10T12:00:00.000Z"),
          source: "integration-test",
          deduplicationKey: "b".repeat(64),
        },
      ],
    });
  });

  afterAll(async () => {
    await database.metricObservation.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.growthEvent.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.metricImportBatch.deleteMany({
      where: { workspaceId: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.workspace.deleteMany({
      where: { id: { in: [ids.workspaceA, ids.workspaceB] } },
    });
    await database.clientOrganization.deleteMany({ where: { id: ids.client } });
    await database.operatorOrganization.deleteMany({ where: { id: ids.operator } });
    await database.$disconnect();
  });

  it("never leaks workspace B metrics or events into workspace A", async () => {
    const snapshot = await loadCommandCenterSnapshot(database, {
      workspaceId: ids.workspaceA,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
    });

    expect(snapshot.workspaceId).toBe(ids.workspaceA);
    expect(snapshot.metrics).toEqual([
      { metricId: "leads", value: 10, currency: null },
    ]);
    expect(snapshot.eventCount).toBe(1);
  });

  it("returns the independent workspace B snapshot", async () => {
    const snapshot = await loadCommandCenterSnapshot(database, {
      workspaceId: ids.workspaceB,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
    });

    expect(snapshot.metrics).toEqual([
      { metricId: "leads", value: 999, currency: null },
    ]);
    expect(snapshot.eventCount).toBe(1);
  });
});
