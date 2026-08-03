import { describe, expect, it, vi } from "vitest";

import { ensureFreshConnectorToken } from "@/modules/growth-connectors/token-refresh";
import type { SecretPayload, SecretProvider } from "@/modules/growth-connectors/secret-provider";

class MemorySecrets implements SecretProvider {
  readonly values = new Map<string, SecretPayload>();
  async put(ref: string, payload: SecretPayload) { this.values.set(ref, payload); }
  async get(ref: string) { return this.values.get(ref) ?? null; }
  async delete(ref: string) { this.values.delete(ref); }
}

describe("connector token refresh", () => {
  it("does not refresh a token that is still fresh", async () => {
    const secrets = new MemorySecrets();
    secrets.values.set("token/ref", {
      accessToken: "access-a",
      refreshToken: "refresh-a",
      expiresAt: "2026-08-03T14:00:00.000Z",
    });
    const refresh = vi.fn();
    const result = await ensureFreshConnectorToken({
      secretRef: "token/ref",
      secrets,
      refresher: { provider: "GOOGLE_ADS", refresh },
      now: new Date("2026-08-03T12:00:00Z"),
    });
    expect(result.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and preserves the old refresh token when omitted", async () => {
    const secrets = new MemorySecrets();
    secrets.values.set("token/ref", {
      accessToken: "access-a",
      refreshToken: "refresh-a",
      expiresAt: "2026-08-03T12:02:00.000Z",
    });
    const refresh = vi.fn().mockResolvedValue({
      accessToken: "access-b",
      expiresAt: new Date("2026-08-03T13:00:00.000Z"),
    });
    const result = await ensureFreshConnectorToken({
      secretRef: "token/ref",
      secrets,
      refresher: { provider: "GOOGLE_ADS", refresh },
      now: new Date("2026-08-03T12:00:00Z"),
    });
    expect(result.refreshed).toBe(true);
    expect(refresh).toHaveBeenCalledWith({ refreshToken: "refresh-a" });
    expect(secrets.values.get("token/ref")).toMatchObject({
      accessToken: "access-b",
      refreshToken: "refresh-a",
    });
  });
});
