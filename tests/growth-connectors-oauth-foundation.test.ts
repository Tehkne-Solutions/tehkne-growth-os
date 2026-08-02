import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createOAuthAttempt, sha256, sha256Base64Url } from "@/modules/growth-connectors/oauth";
import { createOAuthProviderConfiguration } from "@/modules/growth-connectors/oauth-providers";
import {
  decodeMasterKey,
  InvalidSecretMasterKeyError,
  type SecretPayload,
  type SecretProvider,
} from "@/modules/growth-connectors/secret-provider";

class MemorySecrets implements SecretProvider {
  readonly values = new Map<string, SecretPayload>();

  async put(secretRef: string, payload: SecretPayload) {
    this.values.set(secretRef, payload);
  }

  async get(secretRef: string) {
    return this.values.get(secretRef) ?? null;
  }

  async delete(secretRef: string) {
    this.values.delete(secretRef);
  }
}

describe("connector secret provider foundation", () => {
  it("requires an exact 256-bit master key", () => {
    expect(decodeMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => decodeMasterKey(randomBytes(16).toString("base64")))
      .toThrow(InvalidSecretMasterKeyError);
  });
});

describe("connector oauth foundation", () => {
  it("builds Google Ads multi-user authorization with offline access", () => {
    const configuration = createOAuthProviderConfiguration({
      provider: "GOOGLE_ADS",
      clientSecretRef: "growth-connectors/oauth-clients/google-ads",
    });

    expect(configuration.scopes).toContain("https://www.googleapis.com/auth/adwords");
    expect(configuration.extraAuthorizationParams).toMatchObject({
      access_type: "offline",
      prompt: "consent",
    });
  });

  it("requires an explicit Meta Graph API version", () => {
    expect(() => createOAuthProviderConfiguration({
      provider: "META_ADS",
      clientSecretRef: "growth-connectors/oauth-clients/meta-ads",
    })).toThrow(/explicit API version/);

    const configuration = createOAuthProviderConfiguration({
      provider: "META_ADS",
      clientSecretRef: "growth-connectors/oauth-clients/meta-ads",
      metaApiVersion: "v99.0",
    });
    expect(configuration.authorizationEndpoint).toContain("/v99.0/dialog/oauth");
    expect(configuration.scopes).toContain("ads_read");
  });

  it("creates opaque state and PKCE without persisting plaintext state", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("growth-connectors/oauth-clients/google-ads", {
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const executeRaw = vi.fn().mockResolvedValue(1);
    const database = { $executeRaw: executeRaw } as never;
    const configuration = createOAuthProviderConfiguration({
      provider: "GOOGLE_ADS",
      clientSecretRef: "growth-connectors/oauth-clients/google-ads",
    });

    const attempt = await createOAuthAttempt(
      { database, secrets },
      {
        workspaceId: "33333333-3333-4333-8333-333333333333",
        userId: "11111111-1111-4111-8111-111111111111",
        provider: "GOOGLE_ADS",
        redirectUri: "https://growth.example.test/api/connectors/oauth/callback/google-ads",
        configuration,
        now: new Date("2026-08-02T12:00:00.000Z"),
      },
    );

    const url = new URL(attempt.authorizationUrl);
    expect(attempt.state.length).toBeGreaterThan(30);
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")?.length).toBeGreaterThan(30);
    expect([...secrets.values.keys()].some((key) => key.endsWith("/pkce"))).toBe(true);
    expect(JSON.stringify(executeRaw.mock.calls)).not.toContain(attempt.state);
    expect(sha256(attempt.state)).toHaveLength(64);
    expect(sha256Base64Url("verifier")).not.toContain("=");
  });
});
