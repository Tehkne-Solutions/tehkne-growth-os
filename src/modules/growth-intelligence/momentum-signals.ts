import type { DecisionSignal } from "./decision-signals";
import type { MetricTimeSeries } from "./time-series";

export function deriveMomentumDecisionSignals(
  series: readonly MetricTimeSeries[],
): DecisionSignal[] {
  return series
    .map(toMomentumSignal)
    .filter((signal): signal is DecisionSignal => signal !== null)
    .sort((a, b) => b.priority - a.priority || a.metricId.localeCompare(b.metricId));
}

function toMomentumSignal(series: MetricTimeSeries): DecisionSignal | null {
  const base = {
    metricId: series.metricId,
    currency: series.currency,
    key: `${series.metricId}:${series.currency ?? "none"}:momentum`,
  };

  if (series.performanceMomentum === "worsening" && series.momentum === "accelerating") {
    return {
      ...base,
      severity: "warning",
      priority: 75,
      title: `${humanize(series.metricId)} está piorando com aceleração`,
      detail: `A trajetória das últimas janelas está ${formatTrend(series.trend)} e o movimento adverso ganhou magnitude na janela mais recente.`,
    };
  }

  if (series.performanceMomentum === "improving" && series.momentum === "accelerating") {
    return {
      ...base,
      severity: "positive",
      priority: 45,
      title: `${humanize(series.metricId)} melhora com aceleração`,
      detail: `A trajetória das últimas janelas está ${formatTrend(series.trend)} e o movimento favorável ganhou magnitude na janela mais recente.`,
    };
  }

  if (series.momentum === "reversal") {
    return {
      ...base,
      severity: "context",
      priority: 40,
      title: `${humanize(series.metricId)} mudou de direção`,
      detail: "A janela mais recente inverteu o sentido do movimento anterior. A reversão é factual; seu significado depende do Sector Pack e do contexto operacional.",
    };
  }

  return null;
}

export function mergeDecisionSignals(
  primary: readonly DecisionSignal[],
  momentum: readonly DecisionSignal[],
): DecisionSignal[] {
  return [...primary, ...momentum].sort(
    (a, b) => b.priority - a.priority || a.metricId.localeCompare(b.metricId) || a.key.localeCompare(b.key),
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTrend(trend: MetricTimeSeries["trend"]): string {
  switch (trend) {
    case "rising": return "ascendente";
    case "falling": return "descendente";
    case "flat": return "estável";
    case "mixed": return "mista";
    case "insufficient-data": return "sem histórico suficiente";
  }
}
