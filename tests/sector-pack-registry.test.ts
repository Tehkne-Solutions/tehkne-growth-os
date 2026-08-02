import { describe, expect, it } from "vitest";
import { createSectorPackRegistry, getActiveSectorPack } from "@/modules/sector-packs/registry";
import { loadSectorPackManifest } from "@/modules/sector-packs/load-manifest";
import { validateSectorPackManifest } from "@/modules/sector-packs/validate";

const basePack = {
  id: "education",
  version: "1.0.0",
  name: "Education",
  status: "active" as const,
  funnels: [{ id: "enrollment", name: "Matrícula", stages: ["lead", "activated_student"] }],
  metrics: [{ id: "activation_rate", name: "Taxa de ativação", unit: "percentage" as const, direction: "up" as const }],
  events: ["lead_created"],
};

describe("sector pack registry", () => {
  it("validates and registers canonical snake case data ids", () => {
    const pack = validateSectorPackManifest(basePack);
    const registry = createSectorPackRegistry([pack]);
    expect(getActiveSectorPack(registry, "education")).toEqual(pack);
  });

  it("loads the real education manifest", async () => {
    const pack = await loadSectorPackManifest({ id: "education", version: "1.0.0" });
    expect(pack.metrics.some((metric) => metric.id === "activation_rate")).toBe(true);
    expect(pack.events).toContain("application_completed");
  });

  it("rejects duplicate pack versions", () => {
    expect(() => createSectorPackRegistry([basePack, basePack])).toThrow(/Duplicate sector pack/);
  });

  it("rejects malformed manifests", () => {
    expect(() => validateSectorPackManifest({ ...basePack, version: "v1" })).toThrow(/version/);
  });
});
