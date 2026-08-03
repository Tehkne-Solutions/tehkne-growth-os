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
  AttributionReviewNotFoundError,
  AttributionReviewValidationError,
  reviewAttributionLink,
} from "@/modules/growth-attribution/intelligence";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const requestSchema = z.object({
  tenant: tenantSchema,
  attributionLinkId: z.uuid(),
  decision: z.enum(["CONFIRMED", "REJECTED"]),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
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
    const result = await reviewAttributionLink(
      { database, authorizationStore: repository },
      {
        userId: session.userId,
        tenant,
        attributionLinkId: body.attributionLinkId,
        decision: body.decision,
        from: new Date(body.from),
        to: new Date(body.to),
      },
    );

    return Response.json({
      ...result,
      observedAt: result.observedAt.toISOString(),
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidSessionError) return Response.json({ error: "authentication_required" }, { status: 401 });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "attribution_review_forbidden" }, { status: 403 });
    if (error instanceof InvalidRequestOriginError) return Response.json({ error: "invalid_origin" }, { status: 403 });
    if (error instanceof AttributionReviewNotFoundError) return Response.json({ error: "attribution_link_not_found" }, { status: 404 });
    if (error instanceof AttributionReviewValidationError || error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid_attribution_review" }, { status: 400 });
    }
    return Response.json({ error: "attribution_review_unavailable" }, { status: 503 });
  }
}
