import type { CredentialStore } from "./contracts";
import { normalizeEmail } from "../domain/email";
import { hashPassword, verifyPassword } from "../domain/password";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

let dummyHashPromise: Promise<string> | undefined;

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("invalid-credential-placeholder");
  return dummyHashPromise;
}

export async function authenticateWithPassword(
  store: CredentialStore,
  input: Readonly<{ email: string; password: string }>,
  now = new Date(),
): Promise<{ userId: string }> {
  const credential = await store.findCredentialByEmail(
    normalizeEmail(input.email),
  );

  if (!credential) {
    await verifyPassword(input.password, await getDummyHash());
    throw new InvalidCredentialsError();
  }

  if (
    credential.userStatus !== "ACTIVE" ||
    (credential.lockedUntil && credential.lockedUntil > now)
  ) {
    await verifyPassword(input.password, await getDummyHash());
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(
    input.password,
    credential.passwordHash,
  );

  if (!passwordMatches) {
    await store.registerAuthenticationFailure(
      credential.userId,
      now,
      MAX_FAILED_ATTEMPTS,
      new Date(now.getTime() + LOCK_DURATION_MS),
    );
    throw new InvalidCredentialsError();
  }

  await store.registerAuthenticationSuccess(credential.userId, now);
  return Object.freeze({ userId: credential.userId });
}
