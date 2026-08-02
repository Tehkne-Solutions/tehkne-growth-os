import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { DatabaseClient } from "@/shared/db/client";

export type SecretPayload = Readonly<Record<string, string>>;

export interface SecretProvider {
  put(secretRef: string, payload: SecretPayload): Promise<void>;
  get(secretRef: string): Promise<SecretPayload | null>;
  delete(secretRef: string): Promise<void>;
}

export class InvalidSecretMasterKeyError extends Error {}
export class InvalidSecretReferenceError extends Error {}

export class PostgresEncryptedSecretProvider implements SecretProvider {
  private readonly key: Buffer;

  constructor(
    private readonly database: DatabaseClient,
    masterKeyBase64: string,
  ) {
    this.key = decodeMasterKey(masterKeyBase64);
  }

  async put(secretRef: string, payload: SecretPayload): Promise<void> {
    assertSecretRef(secretRef);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    await this.database.$executeRaw`
      INSERT INTO app_secret_vault (secret_ref, ciphertext, iv, auth_tag)
      VALUES (${secretRef}, ${ciphertext}, ${iv}, ${authTag})
      ON CONFLICT (secret_ref) DO UPDATE SET
        ciphertext = EXCLUDED.ciphertext,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        key_version = app_secret_vault.key_version + 1,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  async get(secretRef: string): Promise<SecretPayload | null> {
    assertSecretRef(secretRef);
    const rows = await this.database.$queryRaw<Array<{
      ciphertext: Uint8Array;
      iv: Uint8Array;
      authTag: Uint8Array;
    }>>`
      SELECT ciphertext, iv, auth_tag AS "authTag"
      FROM app_secret_vault
      WHERE secret_ref = ${secretRef}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;

    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.iv));
    decipher.setAuthTag(Buffer.from(row.authTag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as SecretPayload;
  }

  async delete(secretRef: string): Promise<void> {
    assertSecretRef(secretRef);
    await this.database.$executeRaw`
      DELETE FROM app_secret_vault WHERE secret_ref = ${secretRef}
    `;
  }
}

export function decodeMasterKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) {
    throw new InvalidSecretMasterKeyError("Connector secret master key must decode to exactly 32 bytes.");
  }
  return key;
}

function assertSecretRef(value: string): void {
  if (!/^[a-z0-9][a-z0-9/_:.-]{2,239}$/i.test(value)) {
    throw new InvalidSecretReferenceError("Invalid secret reference.");
  }
}
