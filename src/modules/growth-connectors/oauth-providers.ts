import type { OAuthProviderConfiguration } from "./oauth";
import type { ConnectorProvider } from "./types";

export function createOAuthProviderConfiguration(input: Readonly<{
  provider: ConnectorProvider;
  clientSecretRef: string;
  metaApiVersion?: string;
}>): OAuthProviderConfiguration {
  if (input.provider === "GOOGLE_ADS") {
    return {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientSecretRef: input.clientSecretRef,
      scopes: ["https://www.googleapis.com/auth/adwords"],
      extraAuthorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    };
  }

  const version = normalizeMetaApiVersion(input.metaApiVersion);
  return {
    authorizationEndpoint: `https://www.facebook.com/${version}/dialog/oauth`,
    tokenEndpoint: `https://graph.facebook.com/${version}/oauth/access_token`,
    clientSecretRef: input.clientSecretRef,
    scopes: ["ads_read"],
  };
}

function normalizeMetaApiVersion(value: string | undefined): string {
  if (!value || !/^v\d+\.\d+$/.test(value)) {
    throw new Error("Meta OAuth requires an explicit API version such as vXX.X.");
  }
  return value;
}
