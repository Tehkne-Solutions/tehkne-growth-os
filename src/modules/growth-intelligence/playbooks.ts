import type { DecisionSignalSeverity } from "./decision-signals";
import type { MomentumState, PerformanceMomentum } from "./time-series";

export type PlaybookCondition = Readonly<{
  metricId?: string;
  severity?: DecisionSignalSeverity;
  momentum?: MomentumState;
  performanceMomentum?: PerformanceMomentum;
}>;

export type PlaybookAction = Readonly<{
  id: string;
  title: string;
  rationale: string;
  checklist: readonly string[];
}>;

export type DeclarativePlaybookRule = Readonly<{
  id: string;
  version: string;
  name: string;
  status: "active" | "draft" | "deprecated";
  priority: number;
  when: PlaybookCondition;
  action: PlaybookAction;
}>;

export type DeclarativePlaybook = Readonly<{
  sectorPackId: string;
  sectorPackVersion: string;
  rules: readonly DeclarativePlaybookRule[];
}>;

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const dataIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export function validateDeclarativePlaybook(value: unknown): DeclarativePlaybook {
  if (!value || typeof value !== "object") throw new Error("Playbook must be an object");
  const playbook = value as Partial<DeclarativePlaybook>;

  if (!playbook.sectorPackId || !idPattern.test(playbook.sectorPackId)) throw new Error("Invalid playbook sectorPackId");
  if (!playbook.sectorPackVersion || !semverPattern.test(playbook.sectorPackVersion)) throw new Error("Invalid playbook sectorPackVersion");
  if (!Array.isArray(playbook.rules)) throw new Error("Playbook rules are required");

  const seen = new Set<string>();
  for (const rule of playbook.rules) {
    if (!rule.id || !idPattern.test(rule.id)) throw new Error("Invalid playbook rule id");
    if (seen.has(rule.id)) throw new Error(`Duplicate playbook rule: ${rule.id}`);
    seen.add(rule.id);
    if (!semverPattern.test(rule.version)) throw new Error(`Invalid playbook rule version: ${rule.id}`);
    if (!rule.name?.trim()) throw new Error(`Playbook rule name is required: ${rule.id}`);
    if (!["active", "draft", "deprecated"].includes(rule.status)) throw new Error(`Invalid playbook rule status: ${rule.id}`);
    if (!Number.isFinite(rule.priority)) throw new Error(`Invalid playbook rule priority: ${rule.id}`);
    if (!rule.when || typeof rule.when !== "object") throw new Error(`Playbook condition is required: ${rule.id}`);
    if (rule.when.metricId && !dataIdPattern.test(rule.when.metricId)) throw new Error(`Invalid playbook metricId: ${rule.id}`);
    if (!rule.action?.id || !idPattern.test(rule.action.id)) throw new Error(`Invalid playbook action id: ${rule.id}`);
    if (!rule.action.title?.trim() || !rule.action.rationale?.trim()) throw new Error(`Playbook action text is required: ${rule.id}`);
    if (!Array.isArray(rule.action.checklist) || rule.action.checklist.length === 0) throw new Error(`Playbook action checklist is required: ${rule.id}`);
  }

  return playbook as DeclarativePlaybook;
}
