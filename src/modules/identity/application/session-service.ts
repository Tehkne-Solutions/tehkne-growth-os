import { createHash } from "node:crypto";

import type { SessionRecord, SessionStore } from "./contracts";
import { createOpaqueToken, digestOpaqueToken } from "../domain/opaque-token";

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export class InvalidSessionError extends Error {
  constructor() {
    super("The session is invalid or has expired.");
    this.name = "InvalidSessionError";
  }
}

function digestSessionToken(token: string, secret: string): string {
  return digestOpaqueToken(`session:${token}`, secret);
}

function hashMetadata(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function createSession(
  store: SessionStore,
  input: Readonly<{
    userId: string;
    secret: string;
    userAgent?: string | null;
    ipPrefix?: string | null;
    ttlMs?: number;
  }>,
  now = new Date(),
): Promise<Readonly<{ id: string; token: string; expiresAt: Date }>> {
  const token = createOpaqueToken();
  const expiresAt = new Date(
    now.getTime() + (input.ttlMs ?? DEFAULT_SESSION_TTL_MS),
  );
  const created = await store.createSession({
    userId: input.userId,
    tokenHash: digestSessionToken(token, input.secret),
    expiresAt,
    lastSeenAt: now,
    userAgentHash: hashMetadata(input.userAgent),
    ipPrefix: input.ipPrefix ?? null,
  });

  return Object.freeze({ id: created.id, token, expiresAt });
}

export async function validateSession(
  store: SessionStore,
  token: string,
  secret: string,
  now = new Date(),
): Promise<SessionRecord> {
  const tokenHash = digestSessionToken(token, secret);
  const session = await store.findSessionByTokenHash(tokenHash);

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.userStatus !== "ACTIVE"
  ) {
    throw new InvalidSessionError();
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await store.touchSession(session.id, now);
  }

  return session;
}

export async function revokeSession(
  store: SessionStore,
  token: string,
  secret: string,
  reason = "user_logout",
  now = new Date(),
): Promise<void> {
  await store.revokeSessionByTokenHash(
    digestSessionToken(token, secret),
    now,
    reason,
  );
}
