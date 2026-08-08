import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { bootstrapRcWorkspace, findRcWorkspace } from "@/modules/growth-operations/rc-workspace";
import { getDatabase } from "@/shared/db/client";

export const dynamic = "force-dynamic";

const confirmationSchema = z.object({
  confirmation: z.enum([
    "APPLY_RC_WORKSPACE_PREVIEW",
    "APPLY_RC_WORKSPACE_PRODUCTION",
  ]),
}).strict();

export async function GET(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "rc_workspace_unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await findRcWorkspace(getDatabase());
    return Response.json({
      status: workspace ? "ready" : "missing",
      workspaceId: workspace?.id ?? null,
      workspaceSlug: workspace?.slug ?? "rc-validation",
      signature: "Tehkné Solutions",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("RC workspace inspection failed", error);
    return Response.json({ error: "rc_workspace_unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const schedulerSecret = process.env.CRON_SECRET;
  if (!schedulerSecret || !authorized(request.headers.get("authorization"), schedulerSecret)) {
    return Response.json({ error: "rc_workspace_unauthorized" }, { status: 401 });
  }

  const targetEnvironment = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;
  const expectedConfirmation = targetEnvironment === "production"
    ? "APPLY_RC_WORKSPACE_PRODUCTION"
    : targetEnvironment === "preview"
      ? "APPLY_RC_WORKSPACE_PREVIEW"
      : null;

  if (!expectedConfirmation) {
    return Response.json({ error: "rc_workspace_environment_not_allowed" }, { status: 409 });
  }

  try {
    const body = confirmationSchema.parse(await request.json());
    if (body.confirmation !== expectedConfirmation) {
      return Response.json({ error: "rc_workspace_confirmation_mismatch" }, { status: 409 });
    }

    const workspace = await bootstrapRcWorkspace(getDatabase());
    return Response.json({
      status: "ready",
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      environment: targetEnvironment,
      signature: "Tehkné Solutions",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "invalid_rc_workspace_request" }, { status: 400 });
    }
    console.error("RC workspace bootstrap failed", error);
    return Response.json({ error: "rc_workspace_bootstrap_failed" }, { status: 503 });
  }
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
