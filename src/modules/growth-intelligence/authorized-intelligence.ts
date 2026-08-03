import { loadAuthorizedCommandCenterIntelligence } from "@/modules/command-center/authorized-query";
import { loadCommandCenterSnapshot } from "@/modules/command-center/query";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import type { TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { deriveDecisionSignals } from "./decision-signals";
import { enrichCommandCenterIntelligence, type InterpretedCommandCenterIntelligence } from "./enrich-command-center";
import { deriveFullFunnelSummary, type FullFunnelSummary } from "./full-funnel-summary";
import { loadActiveMetricGoals } from "./goal-repository";
import { loadDeclarativePlaybook } from "./load-playbook";
import { deriveMomentumDecisionSignals, mergeDecisionSignals } from "./momentum-signals";
import { derivePlaybookRecommendations, type PlaybookRecommendation } from "./playbook-engine";
import {
  buildOlderEquivalentPeriods,
  deriveMetricTimeSeries,
  type MetricTimeSeries,
} from "./time-series";

export type AuthorizedInterpretedCommandCenterIntelligence =
  InterpretedCommandCenterIntelligence & {
    timeSeries: MetricTimeSeries[];
    recommendations: PlaybookRecommendation[];
    fullFunnel: FullFunnelSummary;
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
    const interpreted = enrichCommandCenterIntelligence({
      intelligence,
      sectorPack: null,
      goals: [],
    });
    return {
      ...interpreted,
      timeSeries: deriveMetricTimeSeries({ snapshots, directions: new Map() }),
      recommendations: [],
      fullFunnel: deriveFullFunnelSummary(interpreted.interpretedMetrics),
    };
  }

  const [sectorPack, goals, playbook] = await Promise.all([
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
    loadDeclarativePlaybook({
      sectorPackId: committedPack.sectorPackId,
      sectorPackVersion: committedPack.sectorPackVersion,
      database: dependencies.database,
      workspaceId: intelligence.workspaceId,
    }),
  ]);
  const directions = new Map(sectorPack.metrics.map((metric) => [metric.id, metric.direction]));
  const interpreted = enrichCommandCenterIntelligence({ intelligence, sectorPack, goals });
  const timeSeries = deriveMetricTimeSeries({ snapshots, directions });
  const primarySignals = deriveDecisionSignals(interpreted.interpretedMetrics);
  const momentumSignals = deriveMomentumDecisionSignals(timeSeries);
  const signals = mergeDecisionSignals(primarySignals, momentumSignals);

  return {
    ...interpreted,
    timeSeries,
    recommendations: playbook
      ? derivePlaybookRecommendations({ playbook, signals, timeSeries })
      : [],
    fullFunnel: deriveFullFunnelSummary(interpreted.interpretedMetrics),
  };
}
