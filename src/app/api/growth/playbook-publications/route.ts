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
  createPlaybookPublicationCandidate,
  createPlaybookRollbackCandidate,
  PlaybookPublicationNotFoundError,
  PlaybookPublicationValidationError,
  transitionPlaybookPublicationCandidate,
} from "@/modules/growth-intelligence/playbook-publishing";
import type { DeclarativePlaybookRule } from "@/modules/growth-intelligence/playbooks";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

const tenantSchema = z.object({
  operatorOrganizationId: z.uuid(),
  clientOrganizationId: z.uuid(),
  brandId: z.uuid().optional(),
  workspaceId: z.uuid(),
}).strict();

const ruleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(240),
  status: z.enum(["active", "draft", "deprecated"]),
  priority: z.number().finite(),
  when: z.object({
    metricId: z.string().trim().optional(),
    severity: z.enum(["critical", "warning", "positive", "context"]).optional(),
    momentum: z.enum(["accelerating", "decelerating", "steady", "reversal", "insufficient-data"]).optional(),
    performanceMomentum: z.enum(["improving", "worsening", "stable", "context-required", "insufficient-data"]).optional(),
  }).strict(),
  action: z.object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    rationale: z.string().trim().min(1).max(2000),
    checklist: z.array(z.string().trim().min(1).max(500)).min(1),
  }).strict(),
}).strict();

const requestSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    tenant: tenantSchema,
    proposalId: z.uuid(),
    candidateRule: ruleSchema,
  }).strict(),
  z.object({
    intent: z.literal("rollback"),
    tenant: tenantSchema,
    publishedCandidateId: z.uuid(),
  }).strict(),
  z.object({
    intent: z.literal("transition"),
    tenant: tenantSchema,
    candidateId: z.uuid(),
    status: z.enum(["VALIDATED", "PUBLISHED", "REJECTED"]),
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

    let candidate;
    if (body.intent === "create") {
      candidate = await createPlaybookPublicationCandidate(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          proposalId: body.proposalId,
          candidateRule: normalizeRule(body.candidateRule),
        },
      );
    } else if (body.intent === "rollback") {
      candidate = await createPlaybookRollbackCandidate(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          publishedCandidateId: body.publishedCandidateId,
        },
      );
    } else {
      candidate = await transitionPlaybookPublicationCandidate(
        { database, authorizationStore: repository },
        {
          userId: session.userId,
          tenant,
          candidateId: body.candidateId,
          status: body.status,
        },
      );
    }

    return Response.json(serialize(candidate), {
      status: body.intent === "transition" ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError || error instanceof InvalidRequestOriginError) {
      return Response.json({ error: "playbook_publication_forbidden" }, { status: 403 });
    }
    if (error instanceof PlaybookPublicationNotFoundError) {
      return Response.json({ error: "playbook_publication_not_found" }, { status: 404 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof PlaybookPublicationValidationError
    ) {
      return Response.json({ error: "invalid_playbook_publication" }, { status: 400 });
    }
    return Response.json({ error: "playbook_publication_unavailable" }, { status: 503 });
  }
}

function normalizeRule(value: z.infer<typeof ruleSchema>): DeclarativePlaybookRule {
  return {
    id: value.id,
    version: value.version,
    name: value.name,
    status: value.status,
    priority: value.priority,
    when: {
      ...(value.when.metricId === undefined ? {} : { metricId: value.when.metricId }),
      ...(value.when.severity === undefined ? {} : { severity: value.when.severity }),
      ...(value.when.momentum === undefined ? {} : { momentum: value.when.momentum }),
      ...(value.when.performanceMomentum === undefined
        ? {}
        : { performanceMomentum: value.when.performanceMomentum }),
    },
    action: {
      id: value.action.id,
      title: value.action.title,
      rationale: value.action.rationale,
      checklist: value.action.checklist,
    },
  };
}

function serialize(candidate: Awaited<ReturnType<typeof createPlaybookPublicationCandidate>>) {
  return {
    ...candidate,
    createdAt: candidate.createdAt.toISOString(),
    validatedAt: candidate.validatedAt?.toISOString() ?? null,
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    rejectedAt: candidate.rejectedAt?.toISOString() ?? null,
  };
}
