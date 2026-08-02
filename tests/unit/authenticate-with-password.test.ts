import { describe, expect, it } from "vitest";

import {
  authenticateWithPassword,
  hashPassword,
  InvalidCredentialsError,
} from "@/modules/identity";
import type {
  CredentialRecord,
  CredentialStore,
} from "@/modules/identity/application/contracts";

class MemoryCredentialStore implements CredentialStore {
  failures = 0;
  successes = 0;

  constructor(public credential: CredentialRecord | null) {}

  async findCredentialByEmail() {
    return this.credential;
  }
  async registerAuthenticationFailure() {
    this.failures += 1;
  }
  async registerAuthenticationSuccess() {
    this.successes += 1;
  }
}

describe("password authentication", () => {
  it("normalizes the email and authenticates a valid active credential", async () => {
    const store = new MemoryCredentialStore({
      userId: "user-1",
      userStatus: "ACTIVE",
      passwordHash: await hashPassword("senha-correta-2026"),
      lockedUntil: null,
    });

    await expect(
      authenticateWithPassword(store, {
        email: "  USER@EXAMPLE.COM ",
        password: "senha-correta-2026",
      }),
    ).resolves.toEqual({ userId: "user-1" });
    expect(store.successes).toBe(1);
  });

  it("records a failed password without changing the public error", async () => {
    const store = new MemoryCredentialStore({
      userId: "user-1",
      userStatus: "ACTIVE",
      passwordHash: await hashPassword("senha-correta-2026"),
      lockedUntil: null,
    });

    await expect(
      authenticateWithPassword(store, {
        email: "user@example.com",
        password: "senha-incorreta-2026",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(store.failures).toBe(1);
  });

  it("uses the same generic error for an unknown account", async () => {
    const store = new MemoryCredentialStore(null);

    await expect(
      authenticateWithPassword(store, {
        email: "unknown@example.com",
        password: "senha-qualquer-2026",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
