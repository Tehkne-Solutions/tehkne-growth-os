"use client";

import { useState } from "react";

import {
  GROWTH_EXPERIMENT_CATEGORIES,
  GROWTH_EXPERIMENT_DECISIONS,
  GROWTH_EXPERIMENT_DESIGNS,
  type GrowthExperimentCategory,
  type GrowthExperimentDecision,
  type GrowthExperimentDesign,
  type GrowthExperimentStatus,
} from "@/modules/client-operations/experiment-registry";

import styles from "./experiments.module.css";

type Tenant = Readonly<{ operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string }>;
type ExperimentView = Readonly<{
  id: string;
  title: string;
  hypothesis: string;
  category: GrowthExperimentCategory;
  design: GrowthExperimentDesign;
  targetMetricId: string;
  guardrailMetricId: string | null;
  intervention: string;
  status: GrowthExperimentStatus;
  startAt: string | null;
  observationUntil: string | null;
  decision: GrowthExperimentDecision | null;
  resultSummary: string | null;
  learning: string | null;
  evidenceCaveat: string;
  allowedTransitions: readonly GrowthExperimentStatus[];
}>;

export function ExperimentControls({ tenant, experiments }: Readonly<{ tenant: Tenant; experiments: readonly ExperimentView[] }>) {
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(formData: FormData) {
    setCreating(true); setError(null);
    const body = {
      intent: "create",
      tenant,
      title: text(formData, "title"),
      hypothesis: text(formData, "hypothesis"),
      category: String(formData.get("category") ?? "OTHER"),
      design: String(formData.get("design") ?? "OBSERVATIONAL"),
      targetMetricId: text(formData, "targetMetricId"),
      guardrailMetricId: optionalText(formData, "guardrailMetricId"),
      baselineValue: optionalNumber(formData, "baselineValue"),
      intervention: text(formData, "intervention"),
      observationUntil: optionalDateTime(formData, "observationUntil"),
    };
    const response = await fetch("/api/growth/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setCreating(false); setError("Não foi possível criar o experimento."); return; }
    window.location.reload();
  }

  async function transition(experiment: ExperimentView, formData: FormData) {
    setSavingId(experiment.id); setError(null);
    const toStatus = String(formData.get("toStatus") ?? "");
    const body = {
      intent: "transition",
      tenant,
      experimentId: experiment.id,
      toStatus,
      resultSummary: optionalText(formData, "resultSummary"),
      decision: optionalText(formData, "decision"),
      learning: optionalText(formData, "learning"),
    };
    const response = await fetch("/api/growth/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setSavingId(null); setError(`Transição recusada para ${experiment.title}.`); return; }
    window.location.reload();
  }

  return <>
    <form className={styles.createPanel} action={create}>
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>New Experiment</p><h2>Hipótese antes da mudança.</h2></div><span>DRAFT</span></div>
      <div className={styles.twoColumns}>
        <label><span>Título</span><input name="title" minLength={3} maxLength={240} required /></label>
        <label><span>Métrica alvo</span><input name="targetMetricId" maxLength={120} required placeholder="qualified_opportunities" /></label>
      </div>
      <label><span>Hipótese</span><textarea name="hypothesis" minLength={10} maxLength={5000} required placeholder="Se alterarmos X para Y, esperamos observar Z porque..." /></label>
      <div className={styles.threeColumns}>
        <label><span>Categoria</span><select name="category" defaultValue="CREATIVE">{GROWTH_EXPERIMENT_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Design de evidência</span><select name="design" defaultValue="OBSERVATIONAL">{GROWTH_EXPERIMENT_DESIGNS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Guardrail</span><input name="guardrailMetricId" maxLength={120} placeholder="cac" /></label>
      </div>
      <div className={styles.twoColumns}>
        <label><span>Baseline</span><input name="baselineValue" type="number" step="any" /></label>
        <label><span>Observar até</span><input name="observationUntil" type="datetime-local" /></label>
      </div>
      <label><span>Intervenção</span><textarea name="intervention" minLength={3} maxLength={5000} required placeholder="O que exatamente será alterado durante o experimento?" /></label>
      <div className={styles.formFooter}><p>Criar um experimento não altera campanhas.</p><button disabled={creating}>{creating ? "Criando…" : "Criar experimento"}</button></div>
    </form>

    <section className={styles.experimentGrid}>
      {experiments.map((experiment) => <article className={styles.card} data-status={experiment.status} key={experiment.id}>
        <div className={styles.cardHeader}><div><span>{experiment.category} · {experiment.design}</span><h3>{experiment.title}</h3></div><strong>{experiment.status}</strong></div>
        <p className={styles.hypothesis}>{experiment.hypothesis}</p>
        <dl className={styles.metrics}><div><dt>Target</dt><dd>{experiment.targetMetricId}</dd></div><div><dt>Guardrail</dt><dd>{experiment.guardrailMetricId ?? "—"}</dd></div><div><dt>Start</dt><dd>{formatDate(experiment.startAt)}</dd></div><div><dt>Observe until</dt><dd>{formatDate(experiment.observationUntil)}</dd></div></dl>
        <div className={styles.intervention}><span>Intervention</span><p>{experiment.intervention}</p></div>
        <p className={styles.caveat}>{experiment.evidenceCaveat}</p>
        {experiment.status === "CONCLUDED" ? <div className={styles.conclusion}><strong>{experiment.decision}</strong><p>{experiment.resultSummary}</p><small>Learning: {experiment.learning}</small></div> : null}
        {experiment.allowedTransitions.length > 0 ? <form className={styles.transitionForm} action={(data) => transition(experiment, data)}>
          <label><span>Próximo estado</span><select name="toStatus" required defaultValue=""><option value="" disabled>Selecione</option>{experiment.allowedTransitions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className={styles.conclusionFields}>
            <label><span>Decisão (exigida ao concluir)</span><select name="decision" defaultValue=""><option value="">—</option>{GROWTH_EXPERIMENT_DECISIONS.filter((value) => value !== "CANCELLED").map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Resultado</span><textarea name="resultSummary" maxLength={5000} /></label>
            <label><span>Aprendizado</span><textarea name="learning" maxLength={5000} /></label>
          </div>
          <button disabled={savingId === experiment.id}>{savingId === experiment.id ? "Registrando…" : "Registrar transição"}</button>
        </form> : <p className={styles.terminal}>Estado terminal — histórico preservado.</p>}
      </article>)}
    </section>
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}

function text(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function optionalText(data: FormData, key: string) { const value = text(data, key); return value || null; }
function optionalNumber(data: FormData, key: string) { const value = text(data, key); if (!value) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function optionalDateTime(data: FormData, key: string) { const value = text(data, key); return value ? new Date(value).toISOString() : null; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
