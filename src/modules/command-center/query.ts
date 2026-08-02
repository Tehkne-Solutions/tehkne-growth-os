import type { DatabaseClient } from "@/shared/db/client";

export type CommandCenterMetric = {
  metricId: string;
  value: number;
  currency: string | null;
};

export type CommandCenterSnapshot = {
  workspaceId: string;
  from: Date;
  to: Date;
  metrics: CommandCenterMetric[];
  eventCount: number;
  latestImport: {
    id: string;
    status: string;
    acceptedCount: number;
    rejectedCount: number;
    createdAt: Date;
  } | null;
};

export async function loadCommandCenterSnapshot(
  database: DatabaseClient,
  input: Readonly<{ workspaceId: string; from: Date; to: Date }>,
): Promise<CommandCenterSnapshot> {
  if (input.to < input.from) throw new Error("Invalid command center period");

  const [observations, eventCount, latestImport] = await Promise.all([
    database.metricObservation.groupBy({
      by: ["metricId", "currency"],
      where: {
        workspaceId: input.workspaceId,
        periodStart: { lte: input.to },
        periodEnd: { gte: input.from },
      },
      _sum: { value: true },
      orderBy: { metricId: "asc" },
    }),
    database.growthEvent.count({
      where: {
        workspaceId: input.workspaceId,
        occurredAt: { gte: input.from, lte: input.to },
      },
    }),
    database.metricImportBatch.findFirst({
      where: { workspaceId: input.workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        acceptedCount: true,
        rejectedCount: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    workspaceId: input.workspaceId,
    from: input.from,
    to: input.to,
    metrics: observations.map((row) => ({
      metricId: row.metricId,
      value: Number(row._sum.value ?? 0),
      currency: row.currency,
    })),
    eventCount,
    latestImport,
  };
}
