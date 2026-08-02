import type { ActionEffectivenessRecord, ActionEffectivenessOutcome } from "./action-effectiveness";

export type EffectivenessSummary = Readonly<{
  evaluated: number;
  improved: number;
  worsened: number;
  neutral: number;
  contextRequired: number;
  insufficientData: number;
  improvementRate: number | null;
}>;

export function summarizeEffectiveness(records: readonly Pick<ActionEffectivenessRecord, "outcome">[]): EffectivenessSummary {
  const counts: Record<ActionEffectivenessOutcome, number> = {
    IMPROVED: 0,
    WORSENED: 0,
    NEUTRAL: 0,
    CONTEXT_REQUIRED: 0,
    INSUFFICIENT_DATA: 0,
  };
  for (const record of records) counts[record.outcome] += 1;

  const judged = counts.IMPROVED + counts.WORSENED + counts.NEUTRAL;
  return {
    evaluated: records.length,
    improved: counts.IMPROVED,
    worsened: counts.WORSENED,
    neutral: counts.NEUTRAL,
    contextRequired: counts.CONTEXT_REQUIRED,
    insufficientData: counts.INSUFFICIENT_DATA,
    improvementRate: judged === 0 ? null : (counts.IMPROVED / judged) * 100,
  };
}
