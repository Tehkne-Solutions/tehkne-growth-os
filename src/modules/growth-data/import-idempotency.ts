import { createHash } from "node:crypto";

export function metricImportFingerprint(input: {
  workspaceId: string;
  sectorPackId: string;
  sectorPackVersion: string;
  content: string;
}): string {
  const normalizedContent = input.content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();

  return createHash("sha256")
    .update(input.workspaceId)
    .update("\0")
    .update(input.sectorPackId)
    .update("\0")
    .update(input.sectorPackVersion)
    .update("\0")
    .update(normalizedContent)
    .digest("hex");
}
