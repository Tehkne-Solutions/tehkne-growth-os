import type { ConnectorProvider } from "./types";

export type ConnectorPage<T> = Readonly<{
  records: readonly T[];
  nextCursor: string | null;
  watermark: Date | null;
  hasMore: boolean;
}>;

export type ConnectorAdapter<T> = Readonly<{
  provider: ConnectorProvider;
  mode: "read-only";
  fetchPage(input: Readonly<{
    externalAccountId: string;
    secretRef: string;
    cursor: string | null;
    watermark: Date | null;
  }>): Promise<ConnectorPage<T>>;
}>;
