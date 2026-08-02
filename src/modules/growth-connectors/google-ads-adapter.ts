import {
  parseTokenBundle,
  ProviderAccessVerificationError,
  ProviderOAuthExchangeError,
  type OAuthTokenBundle,
  type ProviderAccount,
  type ProviderAdapterContext,
  type ReadOnlyProviderAdapter,
} from "./provider-adapters";
import type { SecretProvider } from "./secret-provider";

export type FetchLike = typeof fetch;

export class GoogleAdsAdapter implements ReadOnlyProviderAdapter {
  readonly provider = "GOOGLE_ADS" as const;

  constructor(
    private readonly options: Readonly<{
      apiVersion: string;
      developerTokenSecretRef: string;
      tokenEndpoint?: string;
      fetcher?: FetchLike;
    }>,
  ) {
    if (!/^v\d+$/.test(options.apiVersion)) {
      throw new Error("Google Ads API version must be explicit, for example v25.");
    }
  }

  async exchangeAuthorizationCode(input: Readonly<{
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }>): Promise<OAuthTokenBundle> {
    const response = await this.fetcher()(this.options.tokenEndpoint ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
        client_id: input.clientId,
        client_secret: input.clientSecret,
      }),
    });
    if (!response.ok) {
      throw new ProviderOAuthExchangeError(`Google OAuth token exchange failed with HTTP ${response.status}.`);
    }
    const body = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };
    if (!body.access_token) throw new ProviderOAuthExchangeError("Google OAuth response did not include access_token.");
    return {
      accessToken: body.access_token,
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      ...(body.token_type ? { tokenType: body.token_type } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
      ...(typeof body.expires_in === "number"
        ? { expiresAt: new Date(Date.now() + body.expires_in * 1000) }
        : {}),
    };
  }

  async listAccessibleAccounts(context: ProviderAdapterContext): Promise<readonly ProviderAccount[]> {
    const credentials = await this.requireCredentials(context.secrets, context.tokenSecretRef);
    const developerToken = await this.requireDeveloperToken(context.secrets);
    const response = await this.fetcher()(
      `https://googleads.googleapis.com/${this.options.apiVersion}/customers:listAccessibleCustomers`,
      {
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
          "developer-token": developerToken,
          accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new ProviderAccessVerificationError(`Google Ads account discovery failed with HTTP ${response.status}.`);
    }
    const body = await response.json() as { resourceNames?: string[] };
    return (body.resourceNames ?? []).map((resourceName) => {
      const customerId = resourceName.replace(/^customers\//, "");
      return { externalAccountId: customerId, displayName: customerId };
    });
  }

  async verifyReadOnlyAccess(context: ProviderAdapterContext, account: ProviderAccount): Promise<void> {
    const accounts = await this.listAccessibleAccounts(context);
    if (!accounts.some((candidate) => candidate.externalAccountId === account.externalAccountId)) {
      throw new ProviderAccessVerificationError("Selected Google Ads account is not directly accessible by this OAuth user.");
    }
  }

  private async requireCredentials(secrets: SecretProvider, tokenSecretRef: string) {
    const bundle = parseTokenBundle(await secrets.get(tokenSecretRef));
    if (!bundle?.accessToken) throw new ProviderAccessVerificationError("Google Ads access token is unavailable.");
    return bundle;
  }

  private async requireDeveloperToken(secrets: SecretProvider): Promise<string> {
    const payload = await secrets.get(this.options.developerTokenSecretRef);
    if (!payload?.developerToken) {
      throw new ProviderAccessVerificationError("Google Ads developer token is unavailable.");
    }
    return payload.developerToken;
  }

  private fetcher(): FetchLike {
    return this.options.fetcher ?? fetch;
  }
}
