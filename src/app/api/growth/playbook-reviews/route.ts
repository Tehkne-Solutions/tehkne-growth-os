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
  createPlaybookReviewProposal,
  PlaybookReviewNotFoundError,
  PlaybookReviewValidationError,
  transitionPlaybookReviewProposal,
} from "@/modules/growth-intelligence/playbook-review";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const requestSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    tenant: tenantSchema,
    sectorPackId: z.string().trim().min(1).max(120),
    sectorPackVersion: z.string().trim().min(1).max(40),
    ruleId: z.string().trim().min(1).max(120),
    ruleVersion: z.string().trim().min(1).max(40),
    title: z.string().trim().min(3).max(200),
    rationale: z.string().trim().min(3).max(2000),
    proposedChange: z.record(z.string(), z.unknown()),
    evidenceSnapshot: z.record(z.string(), z.unknown()),
  }).strict(),
  z.object({
    intent: z.literal("transition"),
    tenant: tenantSchema,
    proposalId: z.uuid(),
    status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]),
  }).strict(),
]);

export async function POST(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    assertSameOrigin(request, environment.APP_URL);

    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const body = requestSchema.parse(await request.json());
    const tenant = parseTenantContext(body.tenant);

    const proposal = body.intent === "create"
      ? await createPlaybookReviewProposal(
          { database, authorizationStore: repository },
          {
            userId: session.userId,
            tenant,
            sectorPackId: body.sectorPackId,
            sectorPackVersion: body.sectorPackVersion,
            ruleId: body.ruleId,
            ruleVersion: body.ruleVersion,
            title: body.title,
            rationale: body.rationale,
            proposedChange: body.proposedChange,
            evidenceSnapshot: body.evidenceSnapshot,
          },
        )
      : await transitionPlaybookReviewProposal(
          { database, authorizationStore: repository },
          { userId: session.userId, tenant, proposalId: body.proposalId, status: body.status },
        );

    return Response.json(serialize(proposal), {
      status: body.intent === "create" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError || error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "playbook_review_forbidden" }, { status: 403 });
    }
    if (error instanceof PlaybookReviewNotFoundError) {
      return Response.json({ error: "playbook_review_not_found" }, { status: 404 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof PlaybookReviewValidationError
    ) {
      return Response.json({ error: "invalid_playbook_review" }, { status: 400 });
    }
    return Response.json({ error: "playbook_review_unavailable" }, { status: 503 });
  }
}

function serialize(proposal: Awaited<ReturnType<typeof createPlaybookReviewProposal>>) {
  return {
    ...proposal,
    submittedAt: proposal.submittedAt?.toISOString() ?? null,
    reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}
