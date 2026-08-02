import type { InterpretedCommandCenterMetric } from "./enrich-command-center";

export type DecisionSignalSeverity = "critical" | "warning" | "positive" | "context";

export type DecisionSignal = Readonly<{
  key: string;
  metricId: string;
  currency: string | null;
  severity: DecisionSignalSeverity;
  priority: number;
  title: string;
  detail: string;
}>;

export function deriveDecisionSignals(
  metrics: readonly InterpretedCommandCenterMetric[],
): DecisionSignal[] {
  return metrics
    .map(toDecisionSignal)
    .filter((signal): signal is DecisionSignal => signal !== null)
    .sort((a, b) => b.priority - a.priority || a.metricId.localeCompare(b.metricId));
}

function toDecisionSignal(metric: InterpretedCommandCenterMetric): DecisionSignal | null {
  const key = `${metric.metricId}:${metric.currency ?? "none"}`;
  const delta = formatPercentage(metric.percentageDelta);

  if (metric.outcome === "worsened" && metric.goal?.status === "not-met") {
    return {
      key,
      metricId: metric.metricId,
      currency: metric.currency,
      severity: "critical",
      priority: 100,
      title: `${humanize(metric.metricId)} piorou e está fora da meta`,
      detail: `${delta} no período; gap atual ${formatNumber(metric.goal.absoluteGap, metric.currency)}.`,
    };
  }

  if (metric.goal?.status === "not-met") {
    return {
      key,
      metricId: metric.metricId,
      currency: metric.currency,
      severity: "warning",
      priority: 80,
      title: `${humanize(metric.metricId)} está fora da meta`,
      detail: `Gap atual ${formatNumber(metric.goal.absoluteGap, metric.currency)}; atingimento ${formatAttainment(metric.goal.attainmentPercent)}.`,
    };
  }

  if (metric.outcome === "worsened") {
    return {
      key,
      metricId: metric.metricId,
      currency: metric.currency,
      severity: "warning",
      priority: 70,
      title: `${humanize(metric.metricId)} piorou no período`,
      detail: `${delta} contra o período anterior.`,
    };
  }

  if (metric.outcome === "improved" && metric.goal?.status === "met") {
    return {
      key,
      metricId: metric.metricId,
      currency: metric.currency,
      severity: "positive",
      priority: 50,
      title: `${humanize(metric.metricId)} melhorou e atingiu a meta`,
      detail: `${delta} no período; atingimento ${formatAttainment(metric.goal.attainmentPercent)}.`,
    };
  }

  if (metric.outcome === "context-required" || metric.goal?.status === "context-required") {
    return {
      key,
      metricId: metric.metricId,
      currency: metric.currency,
      severity: "context",
      priority: 30,
      title: `${humanize(metric.metricId)} requer contexto`,
      detail: "O Sector Pack não permite classificar este movimento automaticamente como melhora ou piora.",
    };
  }

  return null;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function formatPercentage(value: number | null): string {
  if (value === null) return "sem baseline percentual";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatAttainment(value: number | null): string {
  if (value === null) return "não calculável";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatNumber(value: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toLocaleString("pt-BR")} ${currency}`;
    }
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
