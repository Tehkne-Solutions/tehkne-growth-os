import type { DatabaseClient } from "@/shared/db/client";

import type { MetricGoal } from "./goals";

export async function loadActiveMetricGoals(
  database: DatabaseClient,
  input: Readonly<{
    workspaceId: string;
    sectorPackId: string;
    sectorPackVersion: string;
    at: Date;
  }>,
): Promise<MetricGoal[]> {
  const rows = await database.metricGoal.findMany({
    where: {
      workspaceId: input.workspaceId,
      sectorPackId: input.sectorPackId,
      sectorPackVersion: input.sectorPackVersion,
      validFrom: { lte: input.at },
      OR: [{ validTo: null }, { validTo: { gte: input.at } }],
    },
    orderBy: [{ metricId: "asc" }, { currency: "asc" }, { validFrom: "desc" }],
  });

  const latestByMetric = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.metricId}:${row.currency ?? ""}`;
    if (!latestByMetric.has(key)) latestByMetric.set(key, row);
  }

  return [...latestByMetric.values()].map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    metricId: row.metricId,
    currency: row.currency,
    targetValue: Number(row.targetValue),
    validFrom: row.validFrom,
    validTo: row.validTo,
  }));
}
