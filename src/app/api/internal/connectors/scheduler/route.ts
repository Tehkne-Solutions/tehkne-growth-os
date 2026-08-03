import { timingSafeEqual } from "node:crypto";

import { runConnectorControlPlane, type SchedulerTriggerSource } from "@/modules/growth-connectors/control-plane";
import {
  GoogleAdsPerformanceReader,
  MetaAdsPerformanceReader,
} from "@/modules/growth-connectors/paid-media-performance-adapters";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { ConnectorProvider } from "@/modules/growth-connectors/types";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import { getDatabase } from "@/shared/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "scheduler_unauthorized" }, { status: 401 });
  }

  try {
    const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
    const googleApiVersion = process.env.GOOGLE_ADS_API_VERSION;
    const googleDeveloperTokenSecretRef = process.env.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF;
    const metaApiVersion = process.env.META_GRAPH_API_VERSION;
    if (!masterKey) throw new Error("CONNECTOR_SECRET_MASTER_KEY is required.");

    const database = getDatabase();
    const secrets = new PostgresEncryptedSecretProvider(database, masterKey);
    const triggerSource = readTriggerSource(request);
    const result = await runConnectorControlPlane(
      {
        database,
        secrets,
        resolveReader(provider: ConnectorProvider) {
          if (provider === "GOOGLE_ADS") {
            if (!googleApiVersion || !googleDeveloperTokenSecretRef) {
              throw new Error("Google Ads connector runtime is not configured.");
            }
            return new GoogleAdsPerformanceReader({
              apiVersion: googleApiVersion,
              developerTokenSecretRef: googleDeveloperTokenSecretRef,
            });
          }
          if (provider === "META_ADS") {
            if (!metaApiVersion) throw new Error("Meta Ads connector runtime is not configured.");
            return new MetaAdsPerformanceReader({ apiVersion: metaApiVersion });
          }
          throw new Error(`Unsupported connector provider: ${provider}`);
        },
        resolveRefresher() {
          return null;
        },
        async resolveSectorPack(workspaceId: string) {
          const committed = await database.metricImportBatch.findFirst({
            where: { workspaceId, status: "COMMITTED" },
            orderBy: { committedAt: "desc" },
            select: { sectorPackId: true, sectorPackVersion: true },
          });
          if (!committed) throw new Error(`Workspace ${workspaceId} has no committed Sector Pack.`);
          return loadSectorPackManifest({
            id: committed.sectorPackId,
            version: committed.sectorPackVersion,
          });
        },
      },
      {
        triggerSource,
        budgetMs: 45_000,
        dueAfterMinutes: 180,
        limit: 20,
      },
    );

    return Response.json({
      ok: result.status !== "FAILED",
      runId: result.runId,
      status: result.status,
      budgetMs: result.budgetMs,
      processed: result.results.length,
      succeeded: result.results.filter((item) => item.ok).length,
      failed: result.results.filter((item) => !item.ok).length,
      alerts: result.alerts.map((alert) => ({
        ...alert,
        lastSuccessAt: alert.lastSuccessAt?.toISOString() ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: "scheduler_unavailable",
      detail: error instanceof Error ? error.message : "Unknown scheduler failure",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function readTriggerSource(request: Request): SchedulerTriggerSource {
  const explicit = request.headers.get("x-scheduler-source");
  if (explicit === "github-actions") return "GITHUB_ACTIONS";
  const userAgent = request.headers.get("user-agent") ?? "";
  if (userAgent.includes("vercel-cron/1.0")) return "VERCEL_CRON";
  return "MANUAL_INTERNAL";
}
