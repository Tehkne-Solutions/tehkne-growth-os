"use client";

import { useState } from "react";

import {
  GROWTH_LEAD_QUALITY_CLASSES,
  GROWTH_LEAD_QUALITY_REASONS,
  GROWTH_LEAD_SOURCE_CHANNELS,
} from "@/modules/client-operations/lead-quality";

import styles from "./lead-quality.module.css";

type Tenant = Readonly<{
  operatorOrganizationId: string;
  clientOrganizationId: string;
  workspaceId: string;
  brandId?: string;
}>;

type Summary = Readonly<{
  totalLeads: number;
  reviewedLeads: number;
  unreviewedLeads: number;
  invalidLeads: number;
  unqualifiedLeads: number;
  qualifiedLeads: number;
  highQualityLeads: number;
  convertedLeads: number;
  qualificationRate: number | null;
  highQualityRate: number | null;
  conversionRate: number | null;
  invalidRate: number | null;
}>;

type Segment = Readonly<{
  sourceChannel: string;
  campaignReference: string | null;
  summary: Summary;
}>;

type Observation = Readonly<{
  id: string;
  leadReference: string;
  sourceChannel: string;
  campaignReference: string | null;
  qualityClass: string;
  reasonCode: string | null;
  observedAt: string;
  evidenceReference: string | null;
}>;

export function LeadQualityControls({ tenant, summary, segments, observations }: Readonly<{
  tenant: Tenant;
  summary: Summary;
  segments: readonly Segment[];
  observations: readonly Observation[];
}>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(data: FormData) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/growth/lead-quality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant,
        leadReference: text(data, "leadReference"),
        sourceChannel: text(data, "sourceChannel"),
        campaignReference: optionalText(data, "campaignReference"),
        qualityClass: text(data, "qualityClass"),
        reasonCode: optionalText(data, "reasonCode"),
        observedAt: new Date(text(data, "observedAt")).toISOString(),
        evidenceReference: optionalText(data, "evidenceReference"),
      }),
    });
    if (!response.ok) {
      setSaving(false);
      setError("Observação recusada. Use apenas IDs opacos — nunca e-mail, telefone, token ou senha.");
      return;
    }
    window.location.reload();
  }

  return <>
    <section className={styles.kpis}>
      <Kpi label="Reviewed" value={`${summary.reviewedLeads}/${summary.totalLeads}`} />
      <Kpi label="Qualification rate" value={pct(summary.qualificationRate)} />
      <Kpi label="High-quality rate" value={pct(summary.highQualityRate)} />
      <Kpi label="Conversion rate" value={pct(summary.conversionRate)} />
      <Kpi label="Invalid rate" value={pct(summary.invalidRate)} />
    </section>

    <section className={styles.topGrid}>
      <form className={styles.panel} action={record}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Lead Quality Observation</p><h2>Classificação operacional, não PII.</h2></div><span>APPEND ONLY</span></div>
        <label><span>Lead reference opaca</span><input name="leadReference" maxLength={120} pattern="[A-Za-z0-9:_-]+" required placeholder="hubspot:123456 / crm:lead_987" /></label>
        <div className={styles.twoColumns}>
          <label><span>Source dimension</span><select name="sourceChannel" defaultValue="OTHER">{GROWTH_LEAD_SOURCE_CHANNELS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Campaign reference opcional</span><input name="campaignReference" maxLength={160} pattern="[A-Za-z0-9:_-]+" placeholder="campaign:123" /></label>
        </div>
        <div className={styles.twoColumns}>
          <label><span>Quality class</span><select name="qualityClass" defaultValue="UNREVIEWED">{GROWTH_LEAD_QUALITY_CLASSES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Reason</span><select name="reasonCode" defaultValue=""><option value="">—</option>{GROWTH_LEAD_QUALITY_REASONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <label><span>Observed at</span><input name="observedAt" type="datetime-local" required /></label>
        <label><span>Evidência não secreta</span><input name="evidenceReference" maxLength={240} placeholder="CRM view / QA ticket / call review reference" /></label>
        <div className={styles.formFooter}><p>Campaign reference é agrupamento. Não certifica atribuição.</p><button disabled={saving}>{saving ? "Registrando…" : "Registrar observação"}</button></div>
      </form>

      <article className={styles.panel}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Current Quality Mix</p><h2>Último estado por lead.</h2></div><span>{summary.totalLeads}</span></div>
        <div className={styles.mixGrid}>
          <Mix label="Unreviewed" value={summary.unreviewedLeads} />
          <Mix label="Invalid" value={summary.invalidLeads} />
          <Mix label="Unqualified" value={summary.unqualifiedLeads} />
          <Mix label="Qualified" value={summary.qualifiedLeads} />
          <Mix label="High quality" value={summary.highQualityLeads} />
          <Mix label="Converted" value={summary.convertedLeads} />
        </div>
        <p className={styles.note}>Rates usam somente leads revisados no denominador. HIGH_QUALITY inclui converted no indicador de qualidade alta; QUALIFIED inclui qualified + high-quality + converted.</p>
      </article>
    </section>

    <section className={styles.panelWide}>
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Source Segments</p><h2>Qualidade por dimensão de origem</h2></div><span>NO ATTRIBUTION CLAIM</span></div>
      {segments.length === 0 ? <p className={styles.empty}>Sem segmentos ainda.</p> : <div className={styles.segmentTable}>
        <div className={styles.tableHeader}><span>Source</span><span>Campaign ref</span><span>Reviewed</span><span>Qualified</span><span>High quality</span><span>Converted</span><span>Invalid</span></div>
        {segments.map((segment) => <div className={styles.tableRow} key={`${segment.sourceChannel}:${segment.campaignReference ?? "none"}`}>
          <strong>{segment.sourceChannel}</strong>
          <span>{segment.campaignReference ?? "—"}</span>
          <span>{segment.summary.reviewedLeads}</span>
          <span>{pct(segment.summary.qualificationRate)}</span>
          <span>{pct(segment.summary.highQualityRate)}</span>
          <span>{pct(segment.summary.conversionRate)}</span>
          <span>{pct(segment.summary.invalidRate)}</span>
        </div>)}
      </div>}
    </section>

    <section className={styles.panelWide}>
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Latest per Lead</p><h2>Estado corrente com trilha append-only no banco</h2></div><span>{observations.length}</span></div>
      {observations.length === 0 ? <p className={styles.empty}>Nenhum lead observado.</p> : <div className={styles.observationGrid}>
        {observations.map((item) => <article data-quality={item.qualityClass} key={item.id}>
          <div><span>{item.sourceChannel}{item.campaignReference ? ` · ${item.campaignReference}` : ""}</span><strong>{item.qualityClass}</strong></div>
          <p>{item.leadReference}</p>
          <small>{formatDate(item.observedAt)}{item.reasonCode ? ` · ${item.reasonCode}` : ""}{item.evidenceReference ? ` · ${item.evidenceReference}` : ""}</small>
        </article>)}
      </div>}
    </section>
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Mix({ label, value }: Readonly<{ label: string; value: number }>) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function text(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function optionalText(data: FormData, key: string) { const value = text(data, key); return value || null; }
function pct(value: number | null) { return value === null ? "—" : `${value.toFixed(1)}%`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
