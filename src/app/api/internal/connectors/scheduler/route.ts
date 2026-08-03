import { timingSafeEqual } from "node:crypto";

import { runConnectorControlPlane, type SchedulerTriggerSource } from "@/modules/growth-connectors/control-plane";
import {
  GoogleAdsPerformanceReader,
  MetaAdsPerformanceReader,
} from "@/modules/growth-connectors/paid-media-performance-adapters";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { ConnectorProvider } from "@/modules/growth-connectors/types";
import { runCrmControlPlane } from "@/modules/growth-crm/control-plane";
import { HubSpotCrmAdapter } from "@/modules/growth-crm/hubspot-adapter";
import {
  deliverOperationsNotifications,
  loadUnifiedOperationsNotificationCandidates,
} from "@/modules/growth-operations/notifications";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import type { DatabaseClient } from "@/shared/db/client";
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
    const paidMedia = await runConnectorControlPlane(
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
        resolveSectorPack: (workspaceId) => resolveSectorPack(database, workspaceId),
      },
      {
        triggerSource,
        budgetMs: 30_000,
        dueAfterMinutes: 180,
        limit: 20,
      },
    );

    const crm = paidMedia.status === "SKIPPED_LOCKED"
      ? { status: "SKIPPED_LOCKED" as const, results: [], budgetMs: 15_000 }
      : await runCrmControlPlane(
          {
            database,
            secrets,
            resolveAdapter() {
              return new HubSpotCrmAdapter();
            },
            resolveRefresher() {
              return null;
            },
            resolveSectorPack: (workspaceId) => resolveSectorPack(database, workspaceId),
          },
          {
            budgetMs: 15_000,
            dueAfterMinutes: 180,
            limit: 10,
          },
        );

    const notificationCandidates = await loadUnifiedOperationsNotificationCandidates(database);
    const notificationDelivery = await deliverOperationsNotifications(
      database,
      notificationCandidates,
      {
        ...(process.env.OPERATIONS_ALERT_WEBHOOK_URL ? { url: process.env.OPERATIONS_ALERT_WEBHOOK_URL } : {}),
        ...(process.env.OPERATIONS_ALERT_WEBHOOK_BEARER ? { bearerToken: process.env.OPERATIONS_ALERT_WEBHOOK_BEARER } : {}),
      },
    );

    const failed = paidMedia.status === "FAILED" || crm.status === "FAILED";
    return Response.json({
      ok: !failed,
      runId: paidMedia.runId,
      status: failed ? "FAILED" : paidMedia.status,
      paidMedia: {
        status: paidMedia.status,
        budgetMs: paidMedia.budgetMs,
        processed: paidMedia.results.length,
        succeeded: paidMedia.results.filter((item) => item.ok).length,
        failed: paidMedia.results.filter((item) => !item.ok).length,
      },
      crm: {
        status: crm.status,
        budgetMs: crm.budgetMs,
        processed: crm.results.length,
        succeeded: crm.results.filter((item) => item.ok).length,
        failed: crm.results.filter((item) => !item.ok).length,
      },
      alerts: notificationCandidates.length,
      notifications: notificationDelivery,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: "scheduler_unavailable",
      detail: error instanceof Error ? error.message : "Unknown scheduler failure",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

async function resolveSectorPack(database: DatabaseClient, workspaceId: string) {
  const committed = await database.metricImportBatch.findFirst({
    where: { workspaceId, status: "COMMITTED" },
    orderBy: { committedAt: "desc" },
    select: { sectorPackId: true, sectorPackVersion: true },
  });
  if (!committed) throw new Error(`Workspace ${workspaceId} has no committed Sector Pack.`);
  return loadSectorPackManifest({ id: committed.sectorPackId, version: committed.sectorPackVersion });
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
