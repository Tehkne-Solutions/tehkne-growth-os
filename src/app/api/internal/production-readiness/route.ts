import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { auditProductionReadiness } from "@/modules/growth-operations/production-readiness";
import { getDatabase } from "@/shared/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({ workspaceId: z.uuid() }).strict();

export async function GET(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "readiness_unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const query = querySchema.parse({ workspaceId: url.searchParams.get("workspaceId") });
    const snapshot = await auditProductionReadiness(getDatabase(), query.workspaceId, process.env);
    return Response.json({
      status: snapshot.status,
      firstSync: snapshot.firstSync,
      checks: snapshot.checks,
      signature: "Tehkné Solutions",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "invalid_workspace" }, { status: 400 });
    }
    return Response.json({
      error: "readiness_unavailable",
      detail: error instanceof Error ? error.message : "unknown_readiness_error",
    }, { status: 503 });
  }
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
