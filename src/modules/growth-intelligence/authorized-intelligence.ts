import { loadAuthorizedCommandCenterIntelligence } from "@/modules/command-center/authorized-query";
import { loadCommandCenterSnapshot } from "@/modules/command-center/query";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import type { TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { enrichCommandCenterIntelligence, type InterpretedCommandCenterIntelligence } from "./enrich-command-center";
import { loadActiveMetricGoals } from "./goal-repository";
import {
  buildOlderEquivalentPeriods,
  deriveMetricTimeSeries,
  type MetricTimeSeries,
} from "./time-series";

export type AuthorizedInterpretedCommandCenterIntelligence =
  InterpretedCommandCenterIntelligence & {
    timeSeries: MetricTimeSeries[];
  };

export async function loadAuthorizedInterpretedCommandCenterIntelligence(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    from: Date;
    to: Date;
  }>,
): Promise<AuthorizedInterpretedCommandCenterIntelligence> {
  // Authorization is performed once by the canonical Command Center loader.
  // All historical reads below reuse only the workspaceId returned by that authorized result.
  const intelligence = await loadAuthorizedCommandCenterIntelligence(dependencies, input);
  const olderPeriods = buildOlderEquivalentPeriods({
    from: intelligence.previous.from,
    to: intelligence.previous.to,
    count: 4,
  });
  const olderSnapshots = await Promise.all(
    olderPeriods.map((period) =>
      loadCommandCenterSnapshot(dependencies.database, {
        workspaceId: intelligence.workspaceId,
        from: period.from,
        to: period.to,
      }),
    ),
  );
  const snapshots = [...olderSnapshots, intelligence.previous, intelligence.current];

  const committedPack = await dependencies.database.metricImportBatch.findFirst({
    where: {
      workspaceId: intelligence.workspaceId,
      status: "COMMITTED",
    },
    orderBy: { committedAt: "desc" },
    select: {
      sectorPackId: true,
      sectorPackVersion: true,
    },
  });

  if (!committedPack) {
    return {
      ...enrichCommandCenterIntelligence({
        intelligence,
        sectorPack: null,
        goals: [],
      }),
      timeSeries: deriveMetricTimeSeries({ snapshots, directions: new Map() }),
    };
  }

  const [sectorPack, goals] = await Promise.all([
    loadSectorPackManifest({
      id: committedPack.sectorPackId,
      version: committedPack.sectorPackVersion,
    }),
    loadActiveMetricGoals(dependencies.database, {
      workspaceId: intelligence.workspaceId,
      sectorPackId: committedPack.sectorPackId,
      sectorPackVersion: committedPack.sectorPackVersion,
      at: input.to,
    }),
  ]);
  const directions = new Map(sectorPack.metrics.map((metric) => [metric.id, metric.direction]));

  return {
    ...enrichCommandCenterIntelligence({ intelligence, sectorPack, goals }),
    timeSeries: deriveMetricTimeSeries({ snapshots, directions }),
  };
}
