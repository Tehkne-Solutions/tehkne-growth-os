"use client";

import { useState } from "react";

import styles from "./command-center.module.css";

type GoalEditorProps = Readonly<{
  tenant: {
    operatorOrganizationId: string;
    clientOrganizationId: string;
    brandId?: string;
    workspaceId: string;
  };
  metricId: string;
  currency: string | null;
  currentGoal: number | null;
}>;

export function GoalEditor({ tenant, metricId, currency, currentGoal }: GoalEditorProps) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(formData: FormData) {
    setState("saving");
    const targetValue = Number(formData.get("targetValue"));
    const validFrom = String(formData.get("validFrom") ?? "");

    try {
      const response = await fetch("/api/growth/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant,
          metricId,
          currency,
          targetValue,
          validFrom: new Date(`${validFrom}T00:00:00.000Z`).toISOString(),
        }),
      });

      if (!response.ok) throw new Error("goal_save_failed");
      setState("saved");
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  return (
    <form className={styles.goalEditor} action={submit}>
      <label className={styles.goalField}>
        <span>Meta</span>
        <input
          name="targetValue"
          type="number"
          step="any"
          required
          defaultValue={currentGoal ?? ""}
          aria-label={`Meta para ${metricId}`}
        />
      </label>
      <label className={styles.goalField}>
        <span>Vigente desde</span>
        <input name="validFrom" type="date" required defaultValue={todayUtc()} />
      </label>
      <button className={styles.goalButton} type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Salvando…" : currentGoal === null ? "Definir meta" : "Atualizar meta"}
      </button>
      {state === "error" ? <span className={styles.goalError}>Não foi possível salvar a meta.</span> : null}
      {state === "saved" ? <span className={styles.goalSuccess}>Meta salva.</span> : null}
    </form>
  );
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
