import { parseTokenBundle, serializeTokenBundle, type OAuthTokenBundle } from "./provider-adapters";
import type { SecretProvider } from "./secret-provider";
import type { ConnectorProvider } from "./types";

export interface OAuthTokenRefresher {
  provider: ConnectorProvider;
  refresh(input: Readonly<{ refreshToken: string }>): Promise<OAuthTokenBundle>;
}

export async function ensureFreshConnectorToken(input: Readonly<{
  secretRef: string;
  secrets: SecretProvider;
  refresher: OAuthTokenRefresher;
  now?: Date;
  refreshSkewMs?: number;
}>): Promise<Readonly<{ refreshed: boolean; expiresAt: Date | null }>> {
  const now = input.now ?? new Date();
  const refreshSkewMs = input.refreshSkewMs ?? 5 * 60_000;
  const existing = parseTokenBundle(await input.secrets.get(input.secretRef));
  if (!existing?.accessToken) throw new Error("Connector access token is unavailable.");
  if (!existing.expiresAt || existing.expiresAt.getTime() - now.getTime() > refreshSkewMs) {
    return { refreshed: false, expiresAt: existing.expiresAt ?? null };
  }
  if (!existing.refreshToken) throw new Error("Connector token is expiring and no refresh token is available.");

  const refreshed = await input.refresher.refresh({ refreshToken: existing.refreshToken });
  const scope = refreshed.scope ?? existing.scope;
  const tokenType = refreshed.tokenType ?? existing.tokenType;
  const merged: OAuthTokenBundle = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? existing.refreshToken,
    ...(scope ? { scope } : {}),
    ...(tokenType ? { tokenType } : {}),
    ...(refreshed.expiresAt ? { expiresAt: refreshed.expiresAt } : {}),
  };
  await input.secrets.put(input.secretRef, serializeTokenBundle(merged));
  return { refreshed: true, expiresAt: merged.expiresAt ?? null };
}
