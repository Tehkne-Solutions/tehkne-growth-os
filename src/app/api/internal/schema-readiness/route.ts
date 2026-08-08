import { timingSafeEqual } from "node:crypto";

import { getSchemaReadiness } from "@/modules/growth-operations/schema-readiness";
import { getDatabase } from "@/shared/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "schema_readiness_unauthorized" }, { status: 401 });
  }

  try {
    const readiness = await getSchemaReadiness(getDatabase());
    return Response.json(
      {
        ...readiness,
        signature: "Tehkné Solutions",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Schema readiness probe failed", error);
    return Response.json(
      {
        databaseConnected: false,
        schemaReady: false,
        error: "schema_readiness_unavailable",
        signature: "Tehkné Solutions",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
