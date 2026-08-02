import { describe, expect, it } from "vitest";
import { metricImportFingerprint } from "@/modules/growth-data/import-idempotency";

describe("metric import fingerprint", () => {
  const base = {
    workspaceId: "ws-1",
    sectorPackId: "education",
    sectorPackVersion: "1.0.0",
    content: "metric_id,value\r\nleads,10\r\n",
  };

  it("normalizes line endings", () => {
    expect(metricImportFingerprint(base)).toBe(metricImportFingerprint({
      ...base,
      content: "metric_id,value\nleads,10\n",
    }));
  });

  it("isolates identical files between workspaces", () => {
    expect(metricImportFingerprint(base)).not.toBe(metricImportFingerprint({
      ...base,
      workspaceId: "ws-2",
    }));
  });

  it("changes when sector pack version changes", () => {
    expect(metricImportFingerprint(base)).not.toBe(metricImportFingerprint({
      ...base,
      sectorPackVersion: "1.1.0",
    }));
  });
});
