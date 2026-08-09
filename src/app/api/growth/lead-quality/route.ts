import { cookies } from "next/headers";
import { z } from "zod";

import {
  GROWTH_LEAD_QUALITY_CLASSES,
  GROWTH_LEAD_QUALITY_REASONS,
  GROWTH_LEAD_SOURCE_CHANNELS,
  GrowthLeadQualityValidationError,
  GrowthLeadQualityWorkspaceRequiredError,
  recordLeadQualityObservation,
} from "@/modules/client-operations/lead-quality";
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

const schema = z.object({
  tenant: z.object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid(),
  }).strict(),
  leadReference: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/),
  sourceChannel: z.enum(GROWTH_LEAD_SOURCE_CHANNELS),
  campaignReference: z.string().trim().max(160).regex(/^[A-Za-z0-9:_-]+$/).optional().nullable(),
  qualityClass: z.enum(GROWTH_LEAD_QUALITY_CLASSES),
  reasonCode: z.enum(GROWTH_LEAD_QUALITY_REASONS).optional().nullable(),
  observedAt: z.iso.datetime(),
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
    const observation = await recordLeadQualityObservation(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant: parseTenantContext(body.tenant),
        leadReference: body.leadReference,
        sourceChannel: body.sourceChannel,
        qualityClass: body.qualityClass,
        observedAt: new Date(body.observedAt),
        ...(body.campaignReference === undefined ? {} : { campaignReference: body.campaignReference }),
        ...(body.reasonCode === undefined ? {} : { reasonCode: body.reasonCode }),
        ...(body.evidenceReference === undefined ? {} : { evidenceReference: body.evidenceReference }),
      },
    );
    return Response.json({
      ...observation,
      observedAt: observation.observedAt.toISOString(),
      createdAt: observation.createdAt.toISOString(),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "lead_quality_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof z.ZodError || error instanceof GrowthLeadQualityValidationError || error instanceof GrowthLeadQualityWorkspaceRequiredError) {
      return Response.json({ error: "invalid_lead_quality_request" }, { status: 400 });
    }
    return Response.json({ error: "lead_quality_unavailable" }, { status: 503 });
  }
}
