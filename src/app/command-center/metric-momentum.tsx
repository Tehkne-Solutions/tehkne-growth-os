import type { MetricTimeSeries } from "@/modules/growth-intelligence/time-series";

import styles from "./metric-momentum.module.css";

export function MetricMomentum({ series }: Readonly<{ series: MetricTimeSeries | null }>) {
  if (!series || series.points.length < 2) {
    return <div className={styles.empty}>Histórico insuficiente para momentum.</div>;
  }

  const values = series.points.map((point) => point.value);
  const coordinates = toCoordinates(values, 220, 64, 8);
  const polyline = coordinates.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span>{formatTrend(series.trend)}</span>
        <strong data-performance={series.performanceMomentum}>{formatPerformance(series.performanceMomentum)}</strong>
      </div>
      <svg className={styles.chart} viewBox="0 0 220 64" role="img" aria-label={`Série histórica de ${series.metricId}`}>
        <polyline className={styles.line} points={polyline} fill="none" vectorEffect="non-scaling-stroke" />
        {coordinates.map(([x, y], index) => (
          <circle className={styles.point} cx={x} cy={y} r={index === coordinates.length - 1 ? 3.5 : 2.2} key={`${x}:${y}`} />
        ))}
      </svg>
      <div className={styles.footer}>
        <span>6 janelas</span>
        <span>{formatMomentum(series.momentum)}</span>
      </div>
    </div>
  );
}

function toCoordinates(values: readonly number[], width: number, height: number, padding: number): Array<[number, number]> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values.map((value, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * usableWidth;
    const normalized = range === 0 ? 0.5 : (value - min) / range;
    const y = padding + (1 - normalized) * usableHeight;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
}

function formatTrend(value: MetricTimeSeries["trend"]): string {
  switch (value) {
    case "rising": return "Tendência ascendente";
    case "falling": return "Tendência descendente";
    case "flat": return "Tendência estável";
    case "mixed": return "Tendência mista";
    case "insufficient-data": return "Sem tendência";
  }
}

function formatMomentum(value: MetricTimeSeries["momentum"]): string {
  switch (value) {
    case "accelerating": return "Acelerando";
    case "decelerating": return "Desacelerando";
    case "steady": return "Ritmo estável";
    case "reversal": return "Reversão";
    case "insufficient-data": return "Momentum indisponível";
  }
}

function formatPerformance(value: MetricTimeSeries["performanceMomentum"]): string {
  switch (value) {
    case "improving": return "Melhorando";
    case "worsening": return "Piorando";
    case "stable": return "Estável";
    case "context-required": return "Requer contexto";
    case "insufficient-data": return "Sem semântica";
  }
}
