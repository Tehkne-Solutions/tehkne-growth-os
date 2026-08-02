import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PasswordPolicyError,
  verifyPassword,
} from "@/modules/identity";

describe("password credentials", () => {
  it("derives a salted hash and verifies the matching password", async () => {
    const password = "uma-senha-segura-2026";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword("senha-incorreta", first)).resolves.toBe(false);
  });

  it("rejects passwords below the minimum length", async () => {
    await expect(hashPassword("curta")).rejects.toBeInstanceOf(
      PasswordPolicyError,
    );
  });

  it("fails closed for a malformed stored hash", async () => {
    await expect(verifyPassword("qualquer-senha", "not-a-hash")).resolves.toBe(
      false,
    );
  });
});
