import type { SecretProvider } from "./secret-provider";
import type { ConnectorProvider } from "./types";

export type OAuthTokenBundle = Readonly<{
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: Date;
}>;

export type ProviderAccount = Readonly<{
  externalAccountId: string;
  displayName: string;
  managerAccountId?: string;
}>;

export type ProviderAdapterContext = Readonly<{
  provider: ConnectorProvider;
  tokenSecretRef: string;
  secrets: SecretProvider;
}>;

export interface ReadOnlyProviderAdapter {
  provider: ConnectorProvider;
  exchangeAuthorizationCode(input: Readonly<{
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }>): Promise<OAuthTokenBundle>;
  listAccessibleAccounts(context: ProviderAdapterContext): Promise<readonly ProviderAccount[]>;
  verifyReadOnlyAccess(context: ProviderAdapterContext, account: ProviderAccount): Promise<void>;
}

export class ProviderOAuthExchangeError extends Error {}
export class ProviderAccessVerificationError extends Error {}

export function serializeTokenBundle(bundle: OAuthTokenBundle): Readonly<Record<string, string>> {
  return {
    accessToken: bundle.accessToken,
    ...(bundle.refreshToken ? { refreshToken: bundle.refreshToken } : {}),
    ...(bundle.tokenType ? { tokenType: bundle.tokenType } : {}),
    ...(bundle.scope ? { scope: bundle.scope } : {}),
    ...(bundle.expiresAt ? { expiresAt: bundle.expiresAt.toISOString() } : {}),
  };
}

export function parseTokenBundle(payload: Readonly<Record<string, string>> | null): OAuthTokenBundle | null {
  if (!payload?.accessToken) return null;
  return {
    accessToken: payload.accessToken,
    ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
    ...(payload.tokenType ? { tokenType: payload.tokenType } : {}),
    ...(payload.scope ? { scope: payload.scope } : {}),
    ...(payload.expiresAt ? { expiresAt: new Date(payload.expiresAt) } : {}),
  };
}
