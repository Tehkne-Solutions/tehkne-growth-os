import { describe, expect, it, vi } from "vitest";

import { MetaAdsAdapter } from "@/modules/growth-connectors/meta-ads-adapter";
import type { SecretPayload, SecretProvider } from "@/modules/growth-connectors/secret-provider";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MetaAdsAdapter", () => {
  it("requires an explicit Graph API version", () => {
    expect(() => new MetaAdsAdapter({ apiVersion: "latest" })).toThrow(/explicit/);
    expect(() => new MetaAdsAdapter({ apiVersion: "v99.0" })).not.toThrow();
  });

  it("exchanges an authorization code without exposing the resulting token", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      access_token: "synthetic-access-value",
      token_type: "bearer",
      expires_in: 3600,
    }));
    const adapter = new MetaAdsAdapter({ apiVersion: "v99.0", fetcher: fetcher as never });

    const bundle = await adapter.exchangeAuthorizationCode({
      code: "synthetic-code",
      codeVerifier: "synthetic-verifier",
      redirectUri: "https://growth.example.test/oauth/meta/callback",
      clientId: "synthetic-client",
      clientSecret: "synthetic-client-secret",
    });

    expect(bundle.accessToken).toBe("synthetic-access-value");
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toContain("/v99.0/oauth/access_token");
    expect(requestUrl.searchParams.get("code")).toBe("synthetic-code");
  });

  it("discovers paginated ad accounts and normalizes account ids", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("pending/meta", { accessToken: "synthetic-access-value" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { id: "act_123", name: "Primary" },
          { account_id: "456", name: "Secondary" },
        ],
        paging: { next: "https://graph.example.test/page-2" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "act_123", name: "Primary duplicate" }],
      }));
    const adapter = new MetaAdsAdapter({ apiVersion: "v99.0", fetcher: fetcher as never });

    const accounts = await adapter.listAccessibleAccounts({
      provider: "META_ADS",
      tokenSecretRef: "pending/meta",
      secrets,
    });

    expect(accounts).toEqual([
      { externalAccountId: "act_123", displayName: "Primary duplicate" },
      { externalAccountId: "act_456", displayName: "Secondary" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("verifies the exact selected ad account read-only", async () => {
    const secrets = new MemorySecrets();
    await secrets.put("pending/meta", { accessToken: "synthetic-access-value" });
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: "act_123",
      name: "Primary",
      account_status: 1,
    }));
    const adapter = new MetaAdsAdapter({ apiVersion: "v99.0", fetcher: fetcher as never });

    await expect(adapter.verifyReadOnlyAccess({
      provider: "META_ADS",
      tokenSecretRef: "pending/meta",
      secrets,
    }, {
      externalAccountId: "act_123",
      displayName: "Primary",
    })).resolves.toBeUndefined();
  });
});
