import { describe, expect, it } from "vitest";

import {
  createSession,
  InvalidSessionError,
  revokeSession,
  validateSession,
} from "@/modules/identity";
import type {
  NewSessionRecord,
  SessionRecord,
  SessionStore,
} from "@/modules/identity/application/contracts";

const secret = "test-secret-value-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-02T12:00:00.000Z");

class MemorySessionStore implements SessionStore {
  created: NewSessionRecord | null = null;
  revokedHash: string | null = null;
  session: SessionRecord | null = null;

  async createSession(session: NewSessionRecord) {
    this.created = session;
    return { id: "session-1" };
  }
  async findSessionByTokenHash() {
    return this.session;
  }
  async touchSession() {}
  async revokeSessionByTokenHash(tokenHash: string) {
    this.revokedHash = tokenHash;
  }
  async revokeAllUserSessions() {
    return 0;
  }
}

describe("revocable sessions", () => {
  it("returns a raw token while persisting only its digest", async () => {
    const store = new MemorySessionStore();
    const session = await createSession(
      store,
      { userId: "user-1", secret },
      now,
    );

    expect(session.token.length).toBeGreaterThan(40);
    expect(store.created?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.created?.tokenHash).not.toContain(session.token);
  });

  it("rejects expired and revoked sessions", async () => {
    const store = new MemorySessionStore();
    store.session = {
      id: "session-1",
      userId: "user-1",
      userStatus: "ACTIVE",
      expiresAt: new Date(now.getTime() - 1),
      lastSeenAt: now,
      revokedAt: null,
    };

    await expect(
      validateSession(store, "token", secret, now),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it("revokes by the same digest used during validation", async () => {
    const store = new MemorySessionStore();
    await revokeSession(store, "opaque-token", secret, "test", now);

    expect(store.revokedHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
