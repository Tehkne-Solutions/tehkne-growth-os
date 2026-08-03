import { cookies } from "next/headers";
import { z } from "zod";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import {
  assertSameOrigin,
  getSessionCookieName,
  InvalidRequestOriginError,
} from "@/modules/identity/http/security";
import {
  ConnectorManualSyncValidationError,
  runAuthorizedManualConnectorSync,
} from "@/modules/growth-connectors/manual-sync-service";
import {
  GoogleAdsPerformanceReader,
  MetaAdsPerformanceReader,
} from "@/modules/growth-connectors/paid-media-performance-adapters";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { ConnectorProvider } from "@/modules/growth-connectors/types";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const bodySchema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  connectionId: z.uuid(),
}).strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const sessionSecret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!sessionToken) throw new InvalidSessionError();

    const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
    const googleApiVersion = process.env.GOOGLE_ADS_API_VERSION;
    const googleDeveloperTokenSecretRef = process.env.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF;
    const metaApiVersion = process.env.META_GRAPH_API_VERSION;
    if (!masterKey) throw new Error("CONNECTOR_SECRET_MASTER_KEY is required for connector synchronization.");

    const database = getDatabase();
    const authorizationStore = new PrismaIdentityRepository(database);
    const session = await validateSession(authorizationStore, sessionToken, sessionSecret);
    const body = bodySchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);
    const secrets = new PostgresEncryptedSecretProvider(database, masterKey);

    const result = await runAuthorizedManualConnectorSync(
      {
        database,
        authorizationStore,
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
          throw new Error(`Unsupported paid-media connector provider: ${provider}`);
        },
      },
      {
        userId: session.userId,
        tenant,
        connectionId: body.connectionId,
      },
    );

    return Response.json({
      ok: true,
      attempts: result.attempts,
      runId: result.sync.runId,
      recordsRead: result.sync.recordsRead,
      observationsWritten: result.sync.observationsWritten,
      observationsDeduplicated: result.sync.observationsDeduplicated,
      watermark: result.sync.watermark.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "connector_management_forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof ConnectorManualSyncValidationError) {
      return Response.json({ error: "invalid_connector_sync" }, { status: 400 });
    }
    return Response.json({ error: "connector_sync_unavailable" }, { status: 503 });
  }
}
