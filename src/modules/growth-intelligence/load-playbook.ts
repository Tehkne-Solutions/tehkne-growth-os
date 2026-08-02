import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DatabaseClient } from "@/shared/db/client";

import {
  validateDeclarativePlaybook,
  type DeclarativePlaybook,
  type DeclarativePlaybookRule,
} from "./playbooks";

export async function loadDeclarativePlaybook(input: Readonly<{
  sectorPackId: string;
  sectorPackVersion: string;
  database?: DatabaseClient;
  workspaceId?: string;
}>): Promise<DeclarativePlaybook | null> {
  const filePath = path.join(
    process.cwd(),
    "sector-packs",
    input.sectorPackId,
    "playbooks.json",
  );

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const canonical = validateDeclarativePlaybook(parsed);
    if (
      canonical.sectorPackId !== input.sectorPackId ||
      canonical.sectorPackVersion !== input.sectorPackVersion
    ) {
      throw new Error("Playbook does not match the committed Sector Pack version");
    }

    if (!input.database || !input.workspaceId) return canonical;

    const published = await input.database.$queryRaw<Array<{
      ruleId: string;
      candidateRule: DeclarativePlaybookRule;
    }>>`
      SELECT rule_id AS "ruleId", candidate_rule AS "candidateRule"
      FROM growth_playbook_publication_candidates
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND sector_pack_id = ${input.sectorPackId}
        AND sector_pack_version = ${input.sectorPackVersion}
        AND status = 'PUBLISHED'
      ORDER BY published_at ASC
    `;
    if (published.length === 0) return canonical;

    const rules = new Map(canonical.rules.map((rule) => [rule.id, rule]));
    for (const overlay of published) {
      if (!rules.has(overlay.ruleId)) {
        throw new Error(`Published candidate references unknown rule: ${overlay.ruleId}`);
      }
      rules.set(overlay.ruleId, overlay.candidateRule);
    }

    return validateDeclarativePlaybook({
      sectorPackId: canonical.sectorPackId,
      sectorPackVersion: canonical.sectorPackVersion,
      rules: [...rules.values()],
    });
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
