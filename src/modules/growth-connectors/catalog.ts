import type { ConnectorProvider } from "./types";

export type ConnectorDescriptor = Readonly<{
  provider: ConnectorProvider;
  name: string;
  mode: "read-only";
  capabilities: readonly string[];
  defaultFreshWithinMinutes: number;
  defaultStaleAfterMinutes: number;
}>;

export const CONNECTOR_CATALOG: Readonly<Record<ConnectorProvider, ConnectorDescriptor>> = Object.freeze({
  META_ADS: {
    provider: "META_ADS",
    name: "Meta Ads",
    mode: "read-only",
    capabilities: ["campaign-performance", "adset-performance", "ad-performance", "spend"],
    defaultFreshWithinMinutes: 180,
    defaultStaleAfterMinutes: 720,
  },
  GOOGLE_ADS: {
    provider: "GOOGLE_ADS",
    name: "Google Ads",
    mode: "read-only",
    capabilities: ["campaign-performance", "ad-group-performance", "keyword-performance", "spend"],
    defaultFreshWithinMinutes: 180,
    defaultStaleAfterMinutes: 720,
  },
});

export function getConnectorDescriptor(provider: ConnectorProvider): ConnectorDescriptor {
  return CONNECTOR_CATALOG[provider];
}
