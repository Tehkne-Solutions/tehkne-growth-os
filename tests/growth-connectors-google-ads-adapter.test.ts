import { describe, expect, it, vi } from "vitest";

import { GoogleAdsAdapter } from "@/modules/growth-connectors/google-ads-adapter";
import type { SecretPayload, SecretProvider } from "@/modules/growth-connectors/secret-provider";

class MemorySecrets implements SecretProvider {
  readonly values = new Map<string, SecretPayload>();
  async put(secretRef: string, payload: SecretPayload) { this.values.set(secretRef, payload); }
  async get(secretRef: string) { return this.values.get(secretRef) ?? null; }
  async delete(secretRef: string) { this.values.delete(secretRef); }
}

describe("GoogleAdsAdapter", () => {
  it("uses PKCE during authorization code exchange", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "sample-access",
      refresh_token: "sample-refresh",
      token_type: "Bearer",
      expires_in: 3600,
    }), { status: 200 }));
    const adapter = new GoogleAdsAdapter({
      apiVersion: "v25",
      developerTokenSecretRef: "tests/google/developer",
      fetcher: fetcher as unknown as typeof fetch,
    });

    const bundle = await adapter.exchangeAuthorizationCode({
      code: "sample-code",
      codeVerifier: "sample-verifier",
      redirectUri: "https://example.test/callback",
      clientId: "sample-client",
      clientSecret: "sample-client-value",
    });

    expect(bundle.accessToken).toBe("sample-access");
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("code_verifier=sample-verifier");
  });

  it("discovers directly accessible customer ids", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("tests/google/tokens", { accessToken: "sample-access" });
    await secrets.put("tests/google/developer", { developerToken: "sample-developer" });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      resourceNames: ["customers/1234567890", "customers/9999999999"],
    }), { status: 200 }));
    const adapter = new GoogleAdsAdapter({
      apiVersion: "v25",
      developerTokenSecretRef: "tests/google/developer",
      fetcher: fetcher as unknown as typeof fetch,
    });

    const accounts = await adapter.listAccessibleAccounts({
      provider: "GOOGLE_ADS",
      tokenSecretRef: "tests/google/tokens",
      secrets,
    });

    expect(accounts.map((account) => account.externalAccountId)).toEqual(["1234567890", "9999999999"]);
  });
});
