import type { DatabaseClient } from "@/shared/db/client";

import type { MetricGoal } from "./goals";

type GoalRow = {
  id: string;
  workspace_id: string;
  metric_id: string;
  currency: string | null;
  target_value: unknown;
  valid_from: Date;
  valid_to: Date | null;
};

export async function loadActiveMetricGoals(
  database: DatabaseClient,
  input: Readonly<{
    workspaceId: string;
    sectorPackId: string;
    sectorPackVersion: string;
    at: Date;
  }>,
): Promise<MetricGoal[]> {
  const rows = await database.$queryRaw<GoalRow[]>`
    SELECT DISTINCT ON ("metric_id", COALESCE("currency", ''))
      "id",
      "workspace_id",
      "metric_id",
      "currency",
      "target_value",
      "valid_from",
      "valid_to"
    FROM "metric_goals"
    WHERE "workspace_id" = ${input.workspaceId}::uuid
      AND "sector_pack_id" = ${input.sectorPackId}
      AND "sector_pack_version" = ${input.sectorPackVersion}
      AND "valid_from" <= ${input.at}
      AND ("valid_to" IS NULL OR "valid_to" >= ${input.at})
    ORDER BY "metric_id", COALESCE("currency", ''), "valid_from" DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    metricId: row.metric_id,
    currency: row.currency,
    targetValue: Number(row.target_value),
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }));
}
