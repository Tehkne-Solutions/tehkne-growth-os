"use client";

import { useState } from "react";

type Tenant = {
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
};

export function ManualSyncButton({
  tenant,
  connectionId,
}: Readonly<{
  tenant: Tenant;
  connectionId: string;
}>) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function syncNow() {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/growth/connectors/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant, connectionId }),
      });
      const body = await response.json() as {
        error?: string;
        recordsRead?: number;
        observationsWritten?: number;
        observationsDeduplicated?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "connector_sync_failed");
      setState("success");
      setMessage(
        `${body.recordsRead ?? 0} registros lidos · ${body.observationsWritten ?? 0} observações novas · ${body.observationsDeduplicated ?? 0} deduplicadas`,
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "connector_sync_failed");
    }
  }

  return (
    <div>
      <button type="button" onClick={syncNow} disabled={state === "loading"}>
        {state === "loading" ? "Sincronizando…" : "Sincronizar agora"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
