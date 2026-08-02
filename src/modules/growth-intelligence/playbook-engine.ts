import type { DecisionSignal } from "./decision-signals";
import type { MetricTimeSeries } from "./time-series";
import type { DeclarativePlaybook, DeclarativePlaybookRule } from "./playbooks";

export type PlaybookRecommendation = Readonly<{
  key: string;
  ruleId: string;
  ruleVersion: string;
  actionId: string;
  metricId: string;
  priority: number;
  title: string;
  rationale: string;
  checklist: readonly string[];
  evidence: readonly string[];
}>;

export function derivePlaybookRecommendations(input: Readonly<{
  playbook: DeclarativePlaybook;
  signals: readonly DecisionSignal[];
  timeSeries: readonly MetricTimeSeries[];
}>): PlaybookRecommendation[] {
  const seriesByMetric = new Map(input.timeSeries.map((series) => [series.metricId, series]));
  const recommendations: PlaybookRecommendation[] = [];

  for (const rule of input.playbook.rules) {
    if (rule.status !== "active") continue;

    for (const signal of input.signals) {
      const series = seriesByMetric.get(signal.metricId);
      if (!matches(rule, signal, series)) continue;

      recommendations.push({
        key: `${rule.id}:${signal.key}`,
        ruleId: rule.id,
        ruleVersion: rule.version,
        actionId: rule.action.id,
        metricId: signal.metricId,
        priority: rule.priority + signal.priority,
        title: rule.action.title,
        rationale: rule.action.rationale,
        checklist: rule.action.checklist,
        evidence: buildEvidence(rule, signal, series),
      });
    }
  }

  return recommendations.sort(
    (a, b) => b.priority - a.priority || a.metricId.localeCompare(b.metricId) || a.ruleId.localeCompare(b.ruleId),
  );
}

function matches(
  rule: DeclarativePlaybookRule,
  signal: DecisionSignal,
  series: MetricTimeSeries | undefined,
): boolean {
  const condition = rule.when;
  if (condition.metricId && condition.metricId !== signal.metricId) return false;
  if (condition.severity && condition.severity !== signal.severity) return false;
  if (condition.momentum && condition.momentum !== series?.momentum) return false;
  if (condition.performanceMomentum && condition.performanceMomentum !== series?.performanceMomentum) return false;
  return true;
}

function buildEvidence(
  rule: DeclarativePlaybookRule,
  signal: DecisionSignal,
  series: MetricTimeSeries | undefined,
): string[] {
  const evidence = [
    `signal=${signal.key}`,
    `severity=${signal.severity}`,
    `signal_priority=${signal.priority}`,
    `rule=${rule.id}@${rule.version}`,
  ];

  if (series) {
    evidence.push(`trend=${series.trend}`);
    evidence.push(`momentum=${series.momentum}`);
    evidence.push(`performance_momentum=${series.performanceMomentum}`);
  }

  return evidence;
}
