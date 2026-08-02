import { cookies } from "next/headers";
import { ZodError } from "zod";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import {
  CommandCenterWorkspaceRequiredError,
  loadAuthorizedCommandCenterSnapshot,
} from "@/modules/command-center/authorized-query";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { parseTenantContext } from "@/modules/tenancy";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

export async function GET(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(
      getSessionCookieName(environment.NODE_ENV),
    )?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const identityRepository = new PrismaIdentityRepository(database);
    const session = await validateSession(identityRepository, token, secret);
    const url = new URL(request.url);
    const tenant = parseTenantContext({
      operatorOrganizationId: requiredParam(url, "operatorOrganizationId"),
      clientOrganizationId: requiredParam(url, "clientOrganizationId"),
      brandId: optionalParam(url, "brandId"),
      workspaceId: requiredParam(url, "workspaceId"),
    });
    const from = requiredDate(url, "from");
    const to = requiredDate(url, "to");

    const snapshot = await loadAuthorizedCommandCenterSnapshot(
      { database, authorizationStore: identityRepository },
      { userId: session.userId, tenant, from, to },
    );

    return Response.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return Response.json({ error: "authentication_required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "command_center_forbidden" }, { status: 403 });
    }
    if (
      error instanceof ZodError ||
      error instanceof CommandCenterWorkspaceRequiredError ||
      error instanceof CommandCenterRequestError ||
      (error instanceof Error && error.message === "Invalid command center period")
    ) {
      return Response.json({ error: "invalid_command_center_request" }, { status: 400 });
    }
    return Response.json({ error: "command_center_unavailable" }, { status: 503 });
  }
}

class CommandCenterRequestError extends Error {}

function requiredParam(url: URL, key: string): string {
  const value = url.searchParams.get(key)?.trim();
  if (!value) throw new CommandCenterRequestError(`Missing ${key}`);
  return value;
}

function optionalParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value || undefined;
}

function requiredDate(url: URL, key: string): Date {
  const raw = requiredParam(url, key);
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new CommandCenterRequestError(`Invalid ${key}`);
  }
  return value;
}
