import { createHash } from "node:crypto";

import type { ConnectorAdapter } from "./adapter";
import type { ConnectorCheckpoint } from "./types";

export type NormalizedConnectorRecord = Readonly<{
  externalId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}>;

export type ConnectorRuntimeResult = Readonly<{
  nextCursor: string | null;
  watermark: Date | null;
  recordsRead: number;
  recordsWritten: number;
  recordsDeduplicated: number;
}>;

export async function runIncrementalConnectorSync(input: Readonly<{
  workspaceId: string;
  externalAccountId: string;
  secretRef: string;
  checkpoint: ConnectorCheckpoint | null;
  adapter: ConnectorAdapter<NormalizedConnectorRecord>;
  persist(records: readonly Readonly<{ dedupeKey: string; record: NormalizedConnectorRecord }>[]): Promise<Readonly<{ written: number; deduplicated: number }>>;
}>): Promise<ConnectorRuntimeResult> {
  let cursor = input.checkpoint?.cursor ?? null;
  let watermark = input.checkpoint?.watermark ?? null;
  let recordsRead = 0;
  let recordsWritten = 0;
  let recordsDeduplicated = 0;

  for (;;) {
    const page = await input.adapter.fetchPage({
      externalAccountId: input.externalAccountId,
      secretRef: input.secretRef,
      cursor,
      watermark,
    });
    const prepared = page.records.map((record) => ({
      dedupeKey: connectorRecordDeduplicationKey({
        workspaceId: input.workspaceId,
        provider: input.adapter.provider,
        externalAccountId: input.externalAccountId,
        externalId: record.externalId,
      }),
      record,
    }));
    const persisted = await input.persist(prepared);
    recordsRead += page.records.length;
    recordsWritten += persisted.written;
    recordsDeduplicated += persisted.deduplicated;
    cursor = page.nextCursor;
    watermark = page.watermark ?? watermark;
    if (!page.hasMore) break;
  }

  return { nextCursor: cursor, watermark, recordsRead, recordsWritten, recordsDeduplicated };
}

export function connectorRecordDeduplicationKey(input: Readonly<{
  workspaceId: string;
  provider: string;
  externalAccountId: string;
  externalId: string;
}>): string {
  return createHash("sha256")
    .update(input.workspaceId)
    .update("\0")
    .update(input.provider)
    .update("\0")
    .update(input.externalAccountId)
    .update("\0")
    .update(input.externalId)
    .digest("hex");
}
