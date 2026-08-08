import { cookies } from "next/headers";
import { z } from "zod";

import {
  CLIENT_HANDOVER_ITEM_STATUSES,
  ClientHandoverValidationError,
  ClientHandoverWorkspaceRequiredError,
  updateClientHandoverItem,
} from "@/modules/client-operations/handover-checklist";
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
  "GOOGLE_ADS_MCC", "META_PARTNER_ACCESS", "GA4", "GTM", "WEBSITE_CMS",
  "LANDING_PAGES", "HUBSPOT_CRM", "META_PIXEL_DATASET", "CONVERSIONS_API",
  "DOMAIN_OWNERSHIP", "BILLING_OWNER", "TRACKING_SMOKE", "HANDOVER_CUTOVER",
] as const;

const schema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  itemKey: z.enum(itemKeys),
  status: z.enum(CLIENT_HANDOVER_ITEM_STATUSES),
  externalReference: z.string().trim().max(240).optional().nullable(),
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
    const item = await updateClientHandoverItem(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant: parseTenantContext(body.tenant),
        itemKey: body.itemKey,
        status: body.status,
        ...(body.externalReference === undefined ? {} : { externalReference: body.externalReference }),
      },
    );

    return Response.json({
      itemKey: item.itemKey,
      status: item.status,
      externalReference: item.externalReference,
      verifiedAt: item.verifiedAt?.toISOString() ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "client_handover_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof z.ZodError || error instanceof ClientHandoverValidationError || error instanceof ClientHandoverWorkspaceRequiredError) {
      return Response.json({ error: "invalid_client_handover_request" }, { status: 400 });
    }
    return Response.json({ error: "client_handover_unavailable" }, { status: 503 });
  }
}
