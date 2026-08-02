import {
  parseTokenBundle,
  ProviderAccessVerificationError,
  ProviderOAuthExchangeError,
  type OAuthTokenBundle,
  type ProviderAccount,
  type ProviderAdapterContext,
  type ReadOnlyProviderAdapter,
} from "./provider-adapters";
import type { FetchLike } from "./google-ads-adapter";
import type { SecretProvider } from "./secret-provider";

export class MetaAdsAdapter implements ReadOnlyProviderAdapter {
  readonly provider = "META_ADS" as const;

  constructor(
    private readonly options: Readonly<{
      apiVersion: string;
      tokenEndpoint?: string;
      graphBaseUrl?: string;
      fetcher?: FetchLike;
    }>,
  ) {
    if (!/^v\d+\.\d+$/.test(options.apiVersion)) {
      throw new Error("Meta Graph API version must be explicit, for example vXX.X.");
    }
  }

  async exchangeAuthorizationCode(input: Readonly<{
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }>): Promise<OAuthTokenBundle> {
    const endpoint = new URL(
      this.options.tokenEndpoint
        ?? `${this.graphBaseUrl()}/${this.options.apiVersion}/oauth/access_token`,
    );
    endpoint.searchParams.set("client_id", input.clientId);
    endpoint.searchParams.set("client_secret", input.clientSecret);
    endpoint.searchParams.set("redirect_uri", input.redirectUri);
    endpoint.searchParams.set("code", input.code);

    const response = await this.fetcher()(endpoint, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new ProviderOAuthExchangeError(
        `Meta OAuth token exchange failed with HTTP ${response.status}.`,
      );
    }

    const body = await response.json() as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
    };
    if (!body.access_token) {
      throw new ProviderOAuthExchangeError("Meta OAuth response did not include access_token.");
    }

    return {
      accessToken: body.access_token,
      ...(body.token_type ? { tokenType: body.token_type } : {}),
      ...(typeof body.expires_in === "number"
        ? { expiresAt: new Date(Date.now() + body.expires_in * 1000) }
        : {}),
    };
  }

  async listAccessibleAccounts(context: ProviderAdapterContext): Promise<readonly ProviderAccount[]> {
    const credentials = await this.requireCredentials(context.secrets, context.tokenSecretRef);
    const accounts: ProviderAccount[] = [];
    let nextUrl: string | null = this.buildAccountsUrl(credentials.accessToken);

    while (nextUrl) {
      const response = await this.fetcher()(nextUrl, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new ProviderAccessVerificationError(
          `Meta Ads account discovery failed with HTTP ${response.status}.`,
        );
      }

      const body = await response.json() as {
        data?: Array<{ id?: string; account_id?: string; name?: string }>;
        paging?: { next?: string };
      };

      for (const item of body.data ?? []) {
        const externalAccountId = normalizeMetaAccountId(item.id ?? item.account_id);
        if (!externalAccountId) continue;
        accounts.push({
          externalAccountId,
          displayName: item.name?.trim() || externalAccountId,
        });
      }
      nextUrl = body.paging?.next ?? null;
    }

    return deduplicateAccounts(accounts);
  }

  async verifyReadOnlyAccess(context: ProviderAdapterContext, account: ProviderAccount): Promise<void> {
    const credentials = await this.requireCredentials(context.secrets, context.tokenSecretRef);
    const accountId = normalizeMetaAccountId(account.externalAccountId);
    if (!accountId) throw new ProviderAccessVerificationError("Meta Ads account id is invalid.");

    const url = new URL(`${this.graphBaseUrl()}/${this.options.apiVersion}/${accountId}`);
    url.searchParams.set("fields", "id,name,account_status");
    url.searchParams.set("access_token", credentials.accessToken);

    const response = await this.fetcher()(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new ProviderAccessVerificationError(
        `Selected Meta Ads account failed read-only verification with HTTP ${response.status}.`,
      );
    }

    const body = await response.json() as { id?: string };
    if (normalizeMetaAccountId(body.id) !== accountId) {
      throw new ProviderAccessVerificationError("Meta Ads verification returned a different account.");
    }
  }

  private buildAccountsUrl(accessToken: string): string {
    const url = new URL(`${this.graphBaseUrl()}/${this.options.apiVersion}/me/adaccounts`);
    url.searchParams.set("fields", "id,account_id,name,account_status");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }

  private async requireCredentials(secrets: SecretProvider, tokenSecretRef: string) {
    const bundle = parseTokenBundle(await secrets.get(tokenSecretRef));
    if (!bundle?.accessToken) {
      throw new ProviderAccessVerificationError("Meta Ads access token is unavailable.");
    }
    return bundle;
  }

  private graphBaseUrl(): string {
    return (this.options.graphBaseUrl ?? "https://graph.facebook.com").replace(/\/$/, "");
  }

  private fetcher(): FetchLike {
    return this.options.fetcher ?? fetch;
  }
}

function normalizeMetaAccountId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^act_\d+$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `act_${trimmed}`;
  return null;
}

function deduplicateAccounts(accounts: readonly ProviderAccount[]): readonly ProviderAccount[] {
  return [...new Map(accounts.map((account) => [account.externalAccountId, account])).values()];
}
