"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./page.module.css";

type Tenant = {
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
};

type PendingActivation = {
  attemptId: string;
  provider: "GOOGLE_ADS" | "META_ADS";
  accounts: readonly { externalAccountId: string; displayName: string; managerAccountId?: string }[];
};

type PlatformSecretStatus = {
  googleAdsDeveloperToken: boolean;
  googleAdsOAuthClient: boolean;
  metaAdsOAuthClient: boolean;
};

type PlatformSecretKind =
  | "GOOGLE_ADS_DEVELOPER_TOKEN"
  | "GOOGLE_ADS_OAUTH_CLIENT"
  | "META_ADS_OAUTH_CLIENT";

export function PaidMediaActivationControls({
  tenant,
  returnTo,
  canManage,
  pending,
}: Readonly<{
  tenant: Tenant;
  returnTo: string;
  canManage: boolean;
  pending: PendingActivation | null;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: "GOOGLE_ADS" | "META_ADS") {
    setBusy(provider);
    setError(null);
    try {
      const response = await fetch("/api/growth/setup/paid-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "start", tenant, provider, returnTo }),
      });
      const payload = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error ?? "Não foi possível iniciar OAuth.");
      window.location.assign(payload.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao iniciar conexão.");
      setBusy(null);
    }
  }

  async function activate(account: PendingActivation["accounts"][number]) {
    if (!pending) return;
    setBusy(account.externalAccountId);
    setError(null);
    try {
      const response = await fetch("/api/growth/setup/paid-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "activate", tenant, attemptId: pending.attemptId, account }),
      });
      const payload = await response.json() as { connectionId?: string; error?: string };
      if (!response.ok || !payload.connectionId) throw new Error(payload.error ?? "Não foi possível ativar a conta.");
      router.replace(returnTo);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao ativar conta.");
    } finally {
      setBusy(null);
    }
  }

  if (!canManage) return <p className={styles.readOnly}>Você pode acompanhar o readiness, mas não possui permissão para conectar mídia.</p>;

  return (
    <section className={styles.activationPanel}>
      <div className={styles.activationHeader}>
        <div><p className={styles.eyebrow}>Paid Media Activation</p><h2>Conectar contas de mídia</h2></div>
        <div className={styles.buttonRow}>
          <button type="button" disabled={busy !== null} onClick={() => void start("GOOGLE_ADS")}>Conectar Google Ads</button>
          <button type="button" disabled={busy !== null} onClick={() => void start("META_ADS")}>Conectar Meta Ads</button>
        </div>
      </div>
      {pending ? (
        <div className={styles.accountPicker}>
          <h3>Selecione a conta {pending.provider === "GOOGLE_ADS" ? "Google Ads" : "Meta Ads"}</h3>
          <p>OAuth concluído. A ativação só ocorre depois desta escolha explícita e de uma verificação read-only.</p>
          <div className={styles.accountList}>
            {pending.accounts.length === 0 ? <span>Nenhuma conta acessível foi encontrada.</span> : pending.accounts.map((account) => (
              <button type="button" key={account.externalAccountId} disabled={busy !== null} onClick={() => void activate(account)}>
                <strong>{account.displayName}</strong><span>{account.externalAccountId}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
    </section>
  );
}

export function PlatformConnectorCredentialsForm({
  operatorOrganizationId,
  canManage,
  status,
}: Readonly<{
  operatorOrganizationId: string;
  canManage: boolean;
  status: PlatformSecretStatus | null;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlatformSecretKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(kind: PlatformSecretKind, formData: FormData) {
    setBusy(kind);
    setMessage(null);
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const secret = kind === "GOOGLE_ADS_DEVELOPER_TOKEN"
      ? { operatorOrganizationId, kind, developerToken: value("developerToken") }
      : {
          operatorOrganizationId,
          kind,
          clientId: value("clientId"),
          clientSecret: value("clientSecret"),
        };

    try {
      const response = await fetch("/api/growth/setup/platform-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(secret),
      });
      const payload = await response.json() as {
        configured?: boolean;
        rotated?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.configured) {
        throw new Error(payload.error ?? "Falha ao armazenar credencial de plataforma.");
      }
      setMessage(payload.rotated
        ? "Credencial rotacionada no vault criptografado e registrada na auditoria."
        : "Credencial armazenada no vault criptografado e registrada na auditoria.");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao armazenar credencial de plataforma.");
    } finally {
      setBusy(null);
    }
  }

  if (!canManage) return null;

  return (
    <section className={styles.activationPanel}>
      <div className={styles.activationHeader}>
        <div>
          <p className={styles.eyebrow}>Platform Credential Vault</p>
          <h2>Credenciais Google Ads e Meta Ads</h2>
          <p>Somente administradores no escopo OPERATOR podem gravar ou rotacionar estas credenciais. Valores atuais nunca são exibidos de volta pela aplicação.</p>
        </div>
      </div>

      <div className={styles.accountPicker}>
        <h3>Google Ads · Developer Token</h3>
        <p>{credentialState(status?.googleAdsDeveloperToken)}</p>
        <form action={(formData) => void submit("GOOGLE_ADS_DEVELOPER_TOKEN", formData)} className={styles.hubspotForm}>
          <label className={styles.wide}>Developer Token<input name="developerToken" type="password" required autoComplete="off" placeholder="Armazenado somente no vault AES-256-GCM" /></label>
          <button type="submit" disabled={busy !== null}>{busy === "GOOGLE_ADS_DEVELOPER_TOKEN" ? "Gravando…" : status?.googleAdsDeveloperToken ? "Rotacionar Developer Token" : "Armazenar Developer Token"}</button>
        </form>
      </div>

      <div className={styles.accountPicker}>
        <h3>Google Ads · OAuth Client</h3>
        <p>{credentialState(status?.googleAdsOAuthClient)}</p>
        <form action={(formData) => void submit("GOOGLE_ADS_OAUTH_CLIENT", formData)} className={styles.hubspotForm}>
          <label>Client ID<input name="clientId" required autoComplete="off" /></label>
          <label>Client Secret<input name="clientSecret" type="password" required autoComplete="off" /></label>
          <button type="submit" disabled={busy !== null}>{busy === "GOOGLE_ADS_OAUTH_CLIENT" ? "Gravando…" : status?.googleAdsOAuthClient ? "Rotacionar OAuth Google" : "Armazenar OAuth Google"}</button>
        </form>
      </div>

      <div className={styles.accountPicker}>
        <h3>Meta Ads · OAuth App</h3>
        <p>{credentialState(status?.metaAdsOAuthClient)}</p>
        <form action={(formData) => void submit("META_ADS_OAUTH_CLIENT", formData)} className={styles.hubspotForm}>
          <label>App ID / Client ID<input name="clientId" required autoComplete="off" /></label>
          <label>App Secret<input name="clientSecret" type="password" required autoComplete="off" /></label>
          <button type="submit" disabled={busy !== null}>{busy === "META_ADS_OAUTH_CLIENT" ? "Gravando…" : status?.metaAdsOAuthClient ? "Rotacionar OAuth Meta" : "Armazenar OAuth Meta"}</button>
        </form>
      </div>

      {message ? <p className={styles.formMessage} role="status">{message}</p> : null}
    </section>
  );
}

export function HubSpotActivationForm({ tenant, canManage }: Readonly<{ tenant: Tenant; canManage: boolean }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage(null);
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const attributionProperties = Object.fromEntries(
      ["gclid", "gbraid", "wbraid", "fbclid", "utmCampaign", "utmSource", "googleCampaignId", "metaCampaignId"]
        .map((name) => [name, value(name)] as const)
        .filter(([, property]) => property.length > 0),
    );
    try {
      const response = await fetch("/api/growth/setup/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          portalId: value("portalId"),
          displayName: value("displayName") || "HubSpot",
          accessToken: value("accessToken"),
          attributionProperties,
        }),
      });
      const payload = await response.json() as { connectionId?: string; error?: string };
      if (!response.ok || !payload.connectionId) throw new Error(payload.error ?? "Falha ao conectar HubSpot.");
      setMessage("HubSpot verificado e conexão ACTIVE criada com sucesso.");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao conectar HubSpot.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return <p className={styles.readOnly}>Você pode visualizar o CRM, mas não possui permissão para configurar HubSpot.</p>;

  return (
    <section className={styles.activationPanel}>
      <div><p className={styles.eyebrow}>CRM Activation</p><h2>HubSpot + propriedades de atribuição</h2></div>
      <form action={(formData) => void submit(formData)} className={styles.hubspotForm}>
        <label>Portal ID<input name="portalId" inputMode="numeric" required placeholder="12345678" /></label>
        <label>Nome da conexão<input name="displayName" placeholder="HubSpot principal" /></label>
        <label className={styles.wide}>Private App access token<input name="accessToken" type="password" required autoComplete="off" placeholder="Token armazenado somente no vault criptografado" /></label>
        <fieldset className={styles.wide}>
          <legend>Mapeamento opcional de propriedades</legend>
          <div className={styles.mappingGrid}>
            <label>gclid<input name="gclid" placeholder="hs_google_click_id" /></label>
            <label>gbraid<input name="gbraid" /></label>
            <label>wbraid<input name="wbraid" /></label>
            <label>fbclid<input name="fbclid" /></label>
            <label>utm_campaign<input name="utmCampaign" /></label>
            <label>utm_source<input name="utmSource" /></label>
            <label>Google campaign ID<input name="googleCampaignId" /></label>
            <label>Meta campaign ID<input name="metaCampaignId" /></label>
          </div>
        </fieldset>
        <button type="submit" disabled={busy}>{busy ? "Testando conexão…" : "Testar e ativar HubSpot"}</button>
      </form>
      {message ? <p className={styles.formMessage} role="status">{message}</p> : null}
    </section>
  );
}

function credentialState(value: boolean | undefined): string {
  if (value === true) return "Configurada no vault. Para alterar, informe um novo valor; o anterior nunca é exibido.";
  if (value === false) return "Ausente no vault.";
  return "Status do vault indisponível nesta renderização.";
}
