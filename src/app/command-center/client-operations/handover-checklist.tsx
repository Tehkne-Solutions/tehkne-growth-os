"use client";

import { useState } from "react";

import type {
  ClientHandoverItemKey,
  ClientHandoverItemStatus,
} from "@/modules/client-operations/handover-checklist";

import styles from "./client-operations.module.css";

type Tenant = Readonly<{
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
}>;

type Entry = Readonly<{
  key: ClientHandoverItemKey;
  label: string;
  group: string;
  status: ClientHandoverItemStatus;
  externalReference: string | null;
  verifiedAt: string | null;
}>;

type Props = Readonly<{
  tenant: Tenant;
  entries: readonly Entry[];
  complete: boolean;
  verifiedCount: number;
  notApplicableCount: number;
  blockedCount: number;
}>;

const statuses: readonly ClientHandoverItemStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "VERIFIED",
  "BLOCKED",
  "NOT_APPLICABLE",
];

export function HandoverChecklist({ tenant, entries, complete, verifiedCount, notApplicableCount, blockedCount }: Props) {
  const [savingKey, setSavingKey] = useState<ClientHandoverItemKey | null>(null);
  const [errorKey, setErrorKey] = useState<ClientHandoverItemKey | null>(null);

  async function updateItem(entry: Entry, formData: FormData) {
    setSavingKey(entry.key);
    setErrorKey(null);
    const response = await fetch("/api/growth/client-handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant,
        itemKey: entry.key,
        status: String(formData.get("status") ?? "PENDING"),
        externalReference: reference(formData),
      }),
    });
    if (!response.ok) {
      setSavingKey(null);
      setErrorKey(entry.key);
      return;
    }
    window.location.reload();
  }

  return <section className={styles.handoverPanel}>
    <div className={styles.handoverHeader}>
      <div>
        <p className={styles.eyebrow}>Access & Handover</p>
        <h2>Provar acesso sem compartilhar credenciais.</h2>
        <p>O cliente mantém a propriedade dos ativos. Registre apenas identificadores/referências não secretas e o estado da evidência.</p>
      </div>
      <div className={styles.handoverScore} data-complete={complete ? "true" : "false"}>
        <strong>{complete ? "HANDOVER COMPLETE" : "HANDOVER OPEN"}</strong>
        <span>{verifiedCount} verificados · {notApplicableCount} N/A · {blockedCount} bloqueados</span>
      </div>
    </div>

    <div className={styles.handoverGrid}>
      {entries.map((entry) => <form className={styles.handoverItem} data-status={entry.status} key={entry.key} action={(formData) => updateItem(entry, formData)}>
        <div className={styles.handoverItemTitle}>
          <div><span>{entry.group}</span><strong>{entry.label}</strong></div>
          <em>{humanize(entry.status)}</em>
        </div>
        <label className={styles.field}>
          <span>Status</span>
          <select name="status" defaultValue={entry.status}>{statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select>
        </label>
        <label className={styles.field}>
          <span>Referência não secreta</span>
          <input name="externalReference" maxLength={240} defaultValue={entry.externalReference ?? ""} placeholder={placeholder(entry.key)} autoComplete="off" />
        </label>
        <div className={styles.handoverItemFooter}>
          <small>{entry.verifiedAt ? `Verificado em ${formatDate(entry.verifiedAt)}` : "Sem verificação registrada"}</small>
          <button disabled={savingKey === entry.key}>{savingKey === entry.key ? "Salvando…" : "Atualizar"}</button>
        </div>
        {errorKey === entry.key ? <p className={styles.error}>Atualização recusada. Não insira tokens, senhas ou chaves.</p> : null}
      </form>)}
    </div>
  </section>;
}

function reference(data: FormData): string | null {
  const value = String(data.get("externalReference") ?? "").trim();
  return value || null;
}

function humanize(value: string) { return value.replaceAll("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function placeholder(key: ClientHandoverItemKey): string {
  switch (key) {
    case "GOOGLE_ADS_MCC": return "Customer ID / MCC ID";
    case "META_PARTNER_ACCESS": return "Business ID / act_...";
    case "GA4": return "Property ID / G-...";
    case "GTM": return "GTM-...";
    case "HUBSPOT_CRM": return "Portal ID";
    case "META_PIXEL_DATASET": return "Pixel/Dataset ID";
    case "DOMAIN_OWNERSHIP": return "dominio.com.br";
    case "BILLING_OWNER": return "CLIENT_DIRECT / AGENCY / OTHER_CONFIRMED";
    case "HANDOVER_CUTOVER": return "2026-08-10T09:00:00-03:00";
    default: return "Identificador ou referência não secreta";
  }
}
