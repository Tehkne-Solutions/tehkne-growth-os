import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { loadUnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import { buildProviderCertificationHandoffPack } from "@/modules/growth-operations/provider-certification-handoff";
import { auditProductionReadiness } from "@/modules/growth-operations/production-readiness";
import { getDatabase } from "@/shared/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({ workspaceId: z.uuid() }).strict();

export async function GET(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "provider_handoff_unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const query = querySchema.parse({ workspaceId: url.searchParams.get("workspaceId") });
    const database = getDatabase();
    const [onboarding, production] = await Promise.all([
      loadUnifiedOnboardingReadiness(database, query.workspaceId, process.env),
      auditProductionReadiness(database, query.workspaceId, process.env),
    ]);
    const pack = buildProviderCertificationHandoffPack(onboarding, production);
    return Response.json(pack, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "invalid_workspace" }, { status: 400 });
    }
    return Response.json({
      error: "provider_handoff_unavailable",
      detail: error instanceof Error ? error.message : "unknown_provider_handoff_error",
    }, { status: 503 });
  }
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
