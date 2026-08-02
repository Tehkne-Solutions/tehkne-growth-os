import { loadAuthorizedCommandCenterIntelligence } from "@/modules/command-center/authorized-query";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import type { TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { enrichCommandCenterIntelligence, type InterpretedCommandCenterIntelligence } from "./enrich-command-center";
import { loadActiveMetricGoals } from "./goal-repository";

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
): Promise<InterpretedCommandCenterIntelligence> {
  const intelligence = await loadAuthorizedCommandCenterIntelligence(dependencies, input);

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
    return enrichCommandCenterIntelligence({
      intelligence,
      sectorPack: null,
      goals: [],
    });
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

  return enrichCommandCenterIntelligence({ intelligence, sectorPack, goals });
}
