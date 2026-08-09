"use client";

import { useState } from "react";

import styles from "./pacing.module.css";

type Tenant = Readonly<{
  operatorOrganizationId: string;
  clientOrganizationId: string;
  workspaceId: string;
  brandId?: string;
}>;

type PlanView = Readonly<{
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  budgetAmount: number;
  financialCurrency: string;
  warningDeviationPct: number;
  criticalDeviationPct: number;
  status: string;
  latestObservation: Readonly<{
    observedAt: string;
    actualSpend: number;
    elapsedRatio: number;
    expectedSpend: number;
    projectedSpend: number | null;
    deviationPct: number;
    status: string;
    sourceReference: string | null;
  }> | null;
}>;

type AnomalyView = Readonly<{
  id: string;
  metricId: string;
  observedAt: string;
  observedValue: number;
  baselineValue: number;
  absoluteDelta: number;
  deviationPct: number | null;
  direction: string;
  severity: string;
  evidenceReference: string | null;
  acknowledgedAt: string | null;
}>;

export function PacingControls({ tenant, plans, anomalies, defaultCurrency }: Readonly<{
  tenant: Tenant;
  plans: readonly PlanView[];
  anomalies: readonly AnomalyView[];
  defaultCurrency: string;
}>) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(key: string, payload: object) {
    setSaving(key);
    setError(null);
    const response = await fetch("/api/growth/pacing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setSaving(null);
      setError("Operação recusada. Revise valores, contexto e evidência; nenhum budget foi alterado externamente.");
      return;
    }
    window.location.reload();
  }

  async function createPlan(data: FormData) {
    await post("create-plan", {
      intent: "create_plan",
      tenant,
      label: text(data, "label"),
      periodStart: dateTime(data, "periodStart"),
      periodEnd: dateTime(data, "periodEnd"),
      budgetAmount: number(data, "budgetAmount"),
      financialCurrency: text(data, "financialCurrency") || defaultCurrency,
      warningDeviationPct: number(data, "warningDeviationPct"),
      criticalDeviationPct: number(data, "criticalDeviationPct"),
    });
  }

  async function observe(planId: string, data: FormData) {
    await post(`observe:${planId}`, {
      intent: "observe_plan",
      tenant,
      planId,
      observedAt: dateTime(data, "observedAt"),
      actualSpend: number(data, "actualSpend"),
      sourceReference: optionalText(data, "sourceReference"),
    });
  }

  async function recordAnomaly(data: FormData) {
    await post("anomaly", {
      intent: "record_anomaly",
      tenant,
      metricId: text(data, "metricId"),
      observedAt: dateTime(data, "observedAt"),
      observedValue: number(data, "observedValue"),
      baselineValue: number(data, "baselineValue"),
      watchThresholdPct: number(data, "watchThresholdPct"),
      highThresholdPct: number(data, "highThresholdPct"),
      criticalThresholdPct: number(data, "criticalThresholdPct"),
      evidenceReference: optionalText(data, "evidenceReference"),
    });
  }

  async function acknowledge(anomalyId: string) {
    await post(`ack:${anomalyId}`, { intent: "acknowledge_anomaly", tenant, anomalyId });
  }

  return <>
    <section className={styles.forms}>
      <form className={styles.panel} action={createPlan}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Budget Plan</p><h2>Planejar antes de medir pace.</h2></div><span>OBSERVATIONAL</span></div>
        <label><span>Label</span><input name="label" minLength={3} maxLength={240} required placeholder="Meta + Google · Agosto" /></label>
        <div className={styles.twoColumns}>
          <label><span>Início</span><input name="periodStart" type="datetime-local" required /></label>
          <label><span>Fim</span><input name="periodEnd" type="datetime-local" required /></label>
        </div>
        <div className={styles.twoColumns}>
          <label><span>Budget</span><input name="budgetAmount" type="number" min="0.01" step="any" required /></label>
          <label><span>Moeda</span><input name="financialCurrency" minLength={3} maxLength={3} defaultValue={defaultCurrency} required /></label>
        </div>
        <div className={styles.twoColumns}>
          <label><span>Warning deviation %</span><input name="warningDeviationPct" type="number" min="0.01" step="any" defaultValue="10" required /></label>
          <label><span>Critical deviation %</span><input name="criticalDeviationPct" type="number" min="0.01" step="any" defaultValue="25" required /></label>
        </div>
        <div className={styles.formFooter}><p>O plano não altera budget no provider.</p><button disabled={saving === "create-plan"}>{saving === "create-plan" ? "Criando…" : "Criar plano"}</button></div>
      </form>

      <form className={styles.panel} action={recordAnomaly}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Performance Anomaly</p><h2>Registrar desvio sem inventar causalidade.</h2></div><span>METRIC</span></div>
        <label><span>Metric ID</span><input name="metricId" maxLength={120} required placeholder="cac / cpl / qualified_opportunities" /></label>
        <label><span>Observed at</span><input name="observedAt" type="datetime-local" required /></label>
        <div className={styles.twoColumns}>
          <label><span>Observed value</span><input name="observedValue" type="number" step="any" required /></label>
          <label><span>Baseline value</span><input name="baselineValue" type="number" step="any" required /></label>
        </div>
        <div className={styles.threeColumns}>
          <label><span>Watch %</span><input name="watchThresholdPct" type="number" min="0.01" step="any" defaultValue="10" required /></label>
          <label><span>High %</span><input name="highThresholdPct" type="number" min="0.01" step="any" defaultValue="20" required /></label>
          <label><span>Critical %</span><input name="criticalThresholdPct" type="number" min="0.01" step="any" defaultValue="40" required /></label>
        </div>
        <label><span>Evidência não secreta</span><input name="evidenceReference" maxLength={240} placeholder="report/query/snapshot reference" /></label>
        <div className={styles.formFooter}><p>Se baseline = 0, severidade fica UNCLASSIFIED.</p><button disabled={saving === "anomaly"}>{saving === "anomaly" ? "Registrando…" : "Registrar anomalia"}</button></div>
      </form>
    </section>

    <section className={styles.planGrid}>
      {plans.map((plan) => <article className={styles.planCard} data-status={plan.latestObservation?.status ?? "NO_DATA"} key={plan.id}>
        <div className={styles.cardHeader}><div><span>{plan.status}</span><h3>{plan.label}</h3></div><strong>{plan.latestObservation?.status ?? "NO DATA"}</strong></div>
        <dl className={styles.metrics}>
          <Metric label="Budget" value={money(plan.budgetAmount, plan.financialCurrency)} />
          <Metric label="Expected" value={plan.latestObservation ? money(plan.latestObservation.expectedSpend, plan.financialCurrency) : "—"} />
          <Metric label="Actual" value={plan.latestObservation ? money(plan.latestObservation.actualSpend, plan.financialCurrency) : "—"} />
          <Metric label="Projected" value={plan.latestObservation?.projectedSpend == null ? "—" : money(plan.latestObservation.projectedSpend, plan.financialCurrency)} />
          <Metric label="Elapsed" value={plan.latestObservation ? `${(plan.latestObservation.elapsedRatio * 100).toFixed(1)}%` : "—"} />
          <Metric label="Deviation" value={plan.latestObservation ? `${signed(plan.latestObservation.deviationPct)}%` : "—"} />
        </dl>
        <p className={styles.period}>{formatDate(plan.periodStart)} → {formatDate(plan.periodEnd)} · thresholds {plan.warningDeviationPct}% / {plan.criticalDeviationPct}%</p>
        <form className={styles.observeForm} action={(data) => observe(plan.id, data)}>
          <label><span>Observed at</span><input name="observedAt" type="datetime-local" required /></label>
          <label><span>Actual spend acumulado</span><input name="actualSpend" type="number" min="0" step="any" required /></label>
          <label><span>Source reference</span><input name="sourceReference" maxLength={240} /></label>
          <button disabled={saving === `observe:${plan.id}`}>{saving === `observe:${plan.id}` ? "Calculando…" : "Registrar snapshot"}</button>
        </form>
      </article>)}
    </section>

    <section className={styles.anomalyPanel}>
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Anomaly Ledger</p><h2>Desvios observados</h2></div><span>{anomalies.length}</span></div>
      {anomalies.length === 0 ? <p className={styles.empty}>Nenhuma anomalia registrada.</p> : <div className={styles.anomalyList}>
        {anomalies.map((item) => <article data-severity={item.severity} key={item.id}>
          <div><span>{item.metricId} · {item.direction}</span><strong>{item.severity}</strong></div>
          <p>{item.baselineValue} → {item.observedValue} · Δ {signed(item.absoluteDelta)}{item.deviationPct == null ? " · % indefinida (baseline zero)" : ` · ${signed(item.deviationPct)}%`}</p>
          <small>{formatDate(item.observedAt)}{item.evidenceReference ? ` · ${item.evidenceReference}` : ""}</small>
          {item.acknowledgedAt ? <em>ACK {formatDate(item.acknowledgedAt)}</em> : <button disabled={saving === `ack:${item.id}`} onClick={() => acknowledge(item.id)}>{saving === `ack:${item.id}` ? "…" : "Acknowledge"}</button>}
        </article>)}
      </div>}
    </section>
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function text(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function optionalText(data: FormData, key: string) { const value = text(data, key); return value || null; }
function number(data: FormData, key: string) { return Number(text(data, key)); }
function dateTime(data: FormData, key: string) { return new Date(text(data, key)).toISOString(); }
function money(value: number, currency: string) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value); }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
