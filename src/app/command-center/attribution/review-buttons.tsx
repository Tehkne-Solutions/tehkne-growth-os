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

export function AttributionReviewButtons({
  tenant,
  attributionLinkId,
}: Readonly<{
  tenant: Tenant;
  attributionLinkId: string;
}>) {
  const router = useRouter();
  const [pending, setPending] = useState<"CONFIRMED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: "CONFIRMED" | "REJECTED") {
    setPending(decision);
    setError(null);
    try {
      const response = await fetch("/api/growth/attribution-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, attributionLinkId, decision }),
      });
      if (!response.ok) throw new Error("Não foi possível registrar a revisão.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao revisar atribuição.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.reviewActions}>
      <button type="button" disabled={pending !== null} onClick={() => void submit("CONFIRMED")}>
        {pending === "CONFIRMED" ? "Confirmando…" : "Confirmar"}
      </button>
      <button className={styles.rejectButton} type="button" disabled={pending !== null} onClick={() => void submit("REJECTED")}>
        {pending === "REJECTED" ? "Rejeitando…" : "Rejeitar"}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
