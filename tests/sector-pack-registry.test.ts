import { describe, expect, it } from "vitest";
import { createSectorPackRegistry, getActiveSectorPack } from "@/modules/sector-packs/registry";
import { validateSectorPackManifest } from "@/modules/sector-packs/validate";

const basePack = {
  id: "education",
  version: "1.0.0",
  name: "Education",
  status: "active" as const,
  funnels: [{ id: "enrollment", name: "Matrícula", stages: ["lead", "enrollment"] }],
  metrics: [{ id: "leads", name: "Leads", unit: "count" as const, direction: "up" as const }],
  events: ["lead_created"],
};

describe("sector pack registry", () => {
  it("validates and registers a pack", () => {
    const pack = validateSectorPackManifest(basePack);
    const registry = createSectorPackRegistry([pack]);
    expect(getActiveSectorPack(registry, "education")).toEqual(pack);
  });

  it("rejects duplicate pack versions", () => {
    expect(() => createSectorPackRegistry([basePack, basePack])).toThrow(/Duplicate sector pack/);
  });

  it("rejects malformed manifests", () => {
    expect(() => validateSectorPackManifest({ ...basePack, version: "v1" })).toThrow(/version/);
  });
});
