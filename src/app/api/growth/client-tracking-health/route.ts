import { cookies } from "next/headers";
import { z } from "zod";

import {
  CLIENT_TRACKING_HEALTH_STATUSES,
  ClientTrackingHealthValidationError,
  ClientTrackingHealthWorkspaceRequiredError,
  updateClientTrackingHealthItem,
} from "@/modules/client-operations/tracking-health";
import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { assertSameOrigin, getSessionCookieName, InvalidRequestOriginError } from "@/modules/identity/http/security";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const itemKeys = [
  "GA4_COLLECTION",
  "GTM_CONTAINER",
  "GOOGLE_ADS_CONVERSION",
  "META_PIXEL_DATASET",
  "CAPI_SERVER_SIDE",
  "EVENT_DEDUPLICATION",
  "ENHANCED_CONVERSIONS",
  "CONSENT_PRIVACY",
  "END_TO_END_SMOKE",
] as const;

const schema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  itemKey: z.enum(itemKeys),
  status: z.enum(CLIENT_TRACKING_HEALTH_STATUSES),
  evidenceReference: z.string().trim().max(240).optional().nullable(),
}).strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const secret = requireSessionSecret(environment);
    const token = (await cookies()).get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = schema.parse(await request.json());
    const item = await updateClientTrackingHealthItem(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant: parseTenantContext(body.tenant),
        itemKey: body.itemKey,
        status: body.status,
        ...(body.evidenceReference === undefined ? {} : { evidenceReference: body.evidenceReference }),
      },
    );

    return Response.json({
      itemKey: item.itemKey,
      status: item.status,
      evidenceReference: item.evidenceReference,
      assessedAt: item.assessedAt.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "client_tracking_health_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof z.ZodError || error instanceof ClientTrackingHealthValidationError || error instanceof ClientTrackingHealthWorkspaceRequiredError) {
      return Response.json({ error: "invalid_client_tracking_health_request" }, { status: 400 });
    }
    return Response.json({ error: "client_tracking_health_unavailable" }, { status: 503 });
  }
}
