"use client";

import { useState } from "react";

import type { ClientLifecycleState, GrowthClientProfile } from "@/modules/client-operations/client-profile";
import styles from "./client-operations.module.css";

type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string };
type Props = Readonly<{ tenant: Tenant; profile: GrowthClientProfile | null; defaultCurrency: string; allowedTransitions: readonly ClientLifecycleState[] }>;

export function ClientOperationsForm({ tenant, profile, defaultCurrency, allowedTransitions }: Props) {
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    setSaving(true); setError(null);
    const response = await fetch("/api/growth/client-operations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "save_profile", tenant,
        primaryBusinessObjective: text(formData, "primaryBusinessObjective"),
        northStarMetricId: text(formData, "northStarMetricId"),
        financialCurrency: text(formData, "financialCurrency") ?? defaultCurrency,
        averageTicket: numberValue(formData, "averageTicket"),
        monthlyMediaBudget: numberValue(formData, "monthlyMediaBudget"),
        salesCycleDays: integerValue(formData, "salesCycleDays"),
        capacityNotes: text(formData, "capacityNotes"),
        seasonalityNotes: text(formData, "seasonalityNotes"),
        handoverSource: text(formData, "handoverSource"),
      }),
    });
    if (!response.ok) { setSaving(false); setError("Não foi possível salvar o intake."); return; }
    window.location.reload();
  }

  async function transition(formData: FormData) {
    setTransitioning(true); setError(null);
    const response = await fetch("/api/growth/client-operations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "transition", tenant, toState: String(formData.get("toState") ?? ""), reason: String(formData.get("reason") ?? "") }),
    });
    if (!response.ok) { setTransitioning(false); setError("A transição foi recusada ou está indisponível."); return; }
    window.location.reload();
  }

  return <div className={styles.formsGrid}>
    <form className={styles.panel} action={save}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Business Intake</p><h2>Contexto do cliente</h2></div><span className={styles.badge}>{profile ? "PERSISTIDO" : "NOVO"}</span></div>
      <label className={styles.fieldWide}><span>Objetivo principal</span><textarea name="primaryBusinessObjective" maxLength={1000} defaultValue={profile?.primaryBusinessObjective ?? ""} /></label>
      <div className={styles.twoColumns}>
        <label className={styles.field}><span>North Star Metric</span><input name="northStarMetricId" maxLength={120} defaultValue={profile?.northStarMetricId ?? ""} /></label>
        <label className={styles.field}><span>Origem / handover</span><input name="handoverSource" maxLength={120} defaultValue={profile?.handoverSource ?? ""} /></label>
      </div>
      <div className={styles.threeColumns}>
        <label className={styles.field}><span>Moeda</span><input name="financialCurrency" minLength={3} maxLength={3} required defaultValue={profile?.financialCurrency ?? defaultCurrency} /></label>
        <label className={styles.field}><span>Ticket médio</span><input name="averageTicket" type="number" min="0" step="any" defaultValue={profile?.averageTicket ?? ""} /></label>
        <label className={styles.field}><span>Budget mensal</span><input name="monthlyMediaBudget" type="number" min="0" step="any" defaultValue={profile?.monthlyMediaBudget ?? ""} /></label>
      </div>
      <label className={styles.field}><span>Ciclo de vendas (dias)</span><input name="salesCycleDays" type="number" min="0" step="1" defaultValue={profile?.salesCycleDays ?? ""} /></label>
      <div className={styles.twoColumns}>
        <label className={styles.fieldWide}><span>Capacidade / restrições</span><textarea name="capacityNotes" maxLength={5000} defaultValue={profile?.capacityNotes ?? ""} /></label>
        <label className={styles.fieldWide}><span>Sazonalidade</span><textarea name="seasonalityNotes" maxLength={5000} defaultValue={profile?.seasonalityNotes ?? ""} /></label>
      </div>
      <div className={styles.formFooter}><p>Salvar o intake não altera lifecycle ou mídia.</p><button disabled={saving}>{saving ? "Salvando…" : "Salvar intake"}</button></div>
    </form>

    <form className={styles.panel} action={transition}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Lifecycle</p><h2>Avançar com evidência</h2></div><span className={styles.badge}>{profile?.lifecycleState ?? "INTAKE"}</span></div>
      {!profile ? <div className={styles.empty}>Crie o intake antes de mudar o lifecycle.</div> : allowedTransitions.length === 0 ? <div className={styles.empty}>OFFBOARDING é terminal.</div> : <>
        <label className={styles.field}><span>Próximo estágio</span><select name="toState" required defaultValue=""><option value="" disabled>Selecione</option>{allowedTransitions.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}</select></label>
        <label className={styles.fieldWide}><span>Motivo / evidência</span><textarea name="reason" minLength={3} maxLength={1000} required /></label>
        <div className={styles.formFooter}><p>Transição auditada; nenhuma mutação externa.</p><button disabled={transitioning}>{transitioning ? "Registrando…" : "Registrar transição"}</button></div>
      </>}
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  </div>;
}

function text(data: FormData, key: string) { const value = String(data.get(key) ?? "").trim(); return value || null; }
function numberValue(data: FormData, key: string) { const raw = String(data.get(key) ?? "").trim(); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; }
function integerValue(data: FormData, key: string) { const value = numberValue(data, key); return value === null ? null : Math.trunc(value); }
function humanize(value: string) { return value.replaceAll("_", " "); }
