"use client";

import { useState } from "react";

import type {
  ClientTrackingHealthItemKey,
  ClientTrackingHealthStatus,
} from "@/modules/client-operations/tracking-health";

import styles from "./client-operations.module.css";

type Tenant = Readonly<{
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
}>;

type Entry = Readonly<{
  key: ClientTrackingHealthItemKey;
  label: string;
  group: string;
  status: ClientTrackingHealthStatus;
  evidenceReference: string | null;
  assessedAt: string | null;
}>;

type Props = Readonly<{
  tenant: Tenant;
  entries: readonly Entry[];
  overallStatus: Exclude<ClientTrackingHealthStatus, "NOT_APPLICABLE">;
  healthyCount: number;
  degradedCount: number;
  brokenCount: number;
}>;

const statuses: readonly ClientTrackingHealthStatus[] = [
  "UNKNOWN",
  "PENDING",
  "HEALTHY",
  "DEGRADED",
  "BROKEN",
  "NOT_APPLICABLE",
];

export function TrackingHealthPanel({ tenant, entries, overallStatus, healthyCount, degradedCount, brokenCount }: Props) {
  const [savingKey, setSavingKey] = useState<ClientTrackingHealthItemKey | null>(null);
  const [errorKey, setErrorKey] = useState<ClientTrackingHealthItemKey | null>(null);

  async function update(entry: Entry, formData: FormData) {
    setSavingKey(entry.key);
    setErrorKey(null);
    const response = await fetch("/api/growth/client-tracking-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant,
        itemKey: entry.key,
        status: String(formData.get("status") ?? "UNKNOWN"),
        evidenceReference: readReference(formData),
      }),
    });
    if (!response.ok) {
      setSavingKey(null);
      setErrorKey(entry.key);
      return;
    }
    window.location.reload();
  }

  return <section className={styles.trackingPanel}>
    <div className={styles.trackingHeader}>
      <div>
        <p className={styles.eyebrow}>Tracking Health</p>
        <h2>Sinais confiáveis antes de escalar mídia.</h2>
        <p>Saúde de tracking é evidência de medição. Ela não é inferida pelo simples fato de Google, Meta ou CRM estarem conectados.</p>
      </div>
      <div className={styles.trackingScore} data-status={overallStatus}>
        <strong>{overallStatus}</strong>
        <span>{healthyCount} healthy · {degradedCount} degraded · {brokenCount} broken</span>
      </div>
    </div>

    <div className={styles.trackingGrid}>
      {entries.map((entry) => <form className={styles.trackingItem} data-status={entry.status} key={entry.key} action={(formData) => update(entry, formData)}>
        <div className={styles.trackingItemTitle}>
          <div><span>{entry.group}</span><strong>{entry.label}</strong></div>
          <em>{humanize(entry.status)}</em>
        </div>
        <label className={styles.field}>
          <span>Status</span>
          <select name="status" defaultValue={entry.status}>{statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select>
        </label>
        <label className={styles.field}>
          <span>Evidência não secreta</span>
          <input name="evidenceReference" maxLength={240} defaultValue={entry.evidenceReference ?? ""} placeholder={placeholder(entry.key)} autoComplete="off" />
        </label>
        <div className={styles.trackingItemFooter}>
          <small>{entry.assessedAt ? `Avaliado em ${formatDate(entry.assessedAt)}` : "Ainda não avaliado"}</small>
          <button disabled={savingKey === entry.key}>{savingKey === entry.key ? "Salvando…" : "Atualizar"}</button>
        </div>
        {errorKey === entry.key ? <p className={styles.error}>Atualização recusada. Use apenas evidência não secreta.</p> : null}
      </form>)}
    </div>
  </section>;
}

function readReference(data: FormData): string | null {
  const value = String(data.get("evidenceReference") ?? "").trim();
  return value || null;
}

function humanize(value: string) { return value.replaceAll("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function placeholder(key: ClientTrackingHealthItemKey): string {
  switch (key) {
    case "GA4_COLLECTION": return "Property/Measurement ID + evento testado";
    case "GTM_CONTAINER": return "GTM-...";
    case "GOOGLE_ADS_CONVERSION": return "Conversion action / ID";
    case "META_PIXEL_DATASET": return "Pixel/Dataset ID";
    case "CAPI_SERVER_SIDE": return "Dataset/evento server-side";
    case "EVENT_DEDUPLICATION": return "event_id / dedup smoke";
    case "ENHANCED_CONVERSIONS": return "Conversion action habilitada";
    case "CONSENT_PRIVACY": return "CMP/consent mode verificado";
    case "END_TO_END_SMOKE": return "Lead/purchase smoke + timestamp";
  }
}
