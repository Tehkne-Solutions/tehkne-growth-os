import { createHmac, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function digestOpaqueToken(token: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error(
      "The token digest secret must contain at least 32 characters.",
    );
  }

  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}
