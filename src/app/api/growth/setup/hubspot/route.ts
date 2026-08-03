import { cookies } from "next/headers";
import { z } from "zod";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { assertSameOrigin, getSessionCookieName, InvalidRequestOriginError } from "@/modules/identity/http/security";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { HubSpotAttributionPropertyMap } from "@/modules/growth-crm/types";
import {
  configureHubSpotPrivateApp,
  GuidedActivationConfigurationError,
  GuidedActivationValidationError,
} from "@/modules/growth-onboarding/guided-activation";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const optionalProperty = z.string().trim().min(1).max(180).optional();
const requestSchema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  portalId: z.string().trim().regex(/^\d+$/),
  displayName: z.string().trim().max(180).default("HubSpot"),
  accessToken: z.string().trim().min(12).max(600),
  attributionProperties: z.object({
    gclid: optionalProperty,
    gbraid: optionalProperty,
    wbraid: optionalProperty,
    fbclid: optionalProperty,
    utmCampaign: optionalProperty,
    utmSource: optionalProperty,
    googleCampaignId: optionalProperty,
    metaCampaignId: optionalProperty,
  }).strict(),
}).strict();

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    assertSameOrigin(request, environment.APP_URL);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = requestSchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);
    await authorize(repository, { userId: session.userId, tenant, permission: "growth.crm.manage" });
    const masterKey = process.env.CONNECTOR_SECRET_MASTER_KEY;
    if (!masterKey) throw new GuidedActivationConfigurationError("Connector secret master key is unavailable.");
    const secrets = new PostgresEncryptedSecretProvider(database, masterKey);
    const attributionProperties = normalizeAttributionProperties(body.attributionProperties);
    const result = await configureHubSpotPrivateApp(
      { database, secrets },
      {
        workspaceId: body.tenant.workspaceId,
        portalId: body.portalId,
        displayName: body.displayName,
        accessToken: body.accessToken,
        attributionProperties,
      },
    );
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "crm_manage_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof GuidedActivationValidationError || error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid_hubspot_setup" }, { status: 400 });
    }
    if (error instanceof GuidedActivationConfigurationError) return Response.json({ error: "hubspot_setup_not_configured" }, { status: 503 });
    return Response.json({ error: "hubspot_setup_unavailable" }, { status: 503 });
  }
}

function normalizeAttributionProperties(
  input: z.infer<typeof requestSchema>["attributionProperties"],
): HubSpotAttributionPropertyMap {
  return {
    ...(input.gclid ? { gclid: input.gclid } : {}),
    ...(input.gbraid ? { gbraid: input.gbraid } : {}),
    ...(input.wbraid ? { wbraid: input.wbraid } : {}),
    ...(input.fbclid ? { fbclid: input.fbclid } : {}),
    ...(input.utmCampaign ? { utmCampaign: input.utmCampaign } : {}),
    ...(input.utmSource ? { utmSource: input.utmSource } : {}),
    ...(input.googleCampaignId ? { googleCampaignId: input.googleCampaignId } : {}),
    ...(input.metaCampaignId ? { metaCampaignId: input.metaCampaignId } : {}),
  };
}
