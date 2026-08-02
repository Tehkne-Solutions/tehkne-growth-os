"use client";

import { useMemo, useState } from "react";

import type { GrowthActionItem, GrowthActionStatus } from "@/modules/growth-intelligence/action-workflow";
import type { PlaybookRecommendation } from "@/modules/growth-intelligence/playbook-engine";

import styles from "./command-center.module.css";

type ExplicitWorkspaceTenant = {
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
};

type ActionWorkspaceProps = Readonly<{
  tenant: ExplicitWorkspaceTenant;
  from: string;
  to: string;
  recommendations: readonly PlaybookRecommendation[];
  initialActions: readonly GrowthActionItem[];
}>;

const statusLabels: Record<GrowthActionStatus, string> = {
  OPEN: "Aberta",
  ACCEPTED: "Aceita",
  IN_PROGRESS: "Em execução",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
};

export function ActionWorkspace({ tenant, from, to, recommendations, initialActions }: ActionWorkspaceProps) {
  const [actions, setActions] = useState(() => [...initialActions]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existingByRecommendation = useMemo(
    () => new Map(actions.map((action) => [action.recommendationKey, action])),
    [actions],
  );

  async function materialize(recommendationKey: string) {
    const key = `create:${recommendationKey}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/growth/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "materialize", tenant, recommendationKey, from, to }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const action = await response.json() as GrowthActionItem;
      setActions((current) => upsertAction(current, action));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar a ação.");
    } finally {
      setBusyKey(null);
    }
  }

  async function transition(actionId: string, status: GrowthActionStatus) {
    const key = `transition:${actionId}:${status}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/growth/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "transition", tenant, actionId, status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const action = await response.json() as GrowthActionItem;
      setActions((current) => upsertAction(current, action));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a ação.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className={styles.actionWorkspace} aria-label="Playbooks e ações humanas">
      <div className={styles.signalHeader}>
        <div>
          <p className={styles.eyebrow}>Action Workspace</p>
          <h2>Da recomendação explicável para a execução humana.</h2>
        </div>
        <span className={styles.context}>{actions.length} ações materializadas</span>
      </div>

      {error ? <div className={styles.actionError} role="alert">{error}</div> : null}

      <div className={styles.actionColumns}>
        <div>
          <h3 className={styles.actionColumnTitle}>Recomendações ativas</h3>
          <div className={styles.actionStack}>
            {recommendations.length === 0 ? (
              <div className={styles.emptyBox}>Nenhuma recomendação declarativa está ativa para este período.</div>
            ) : recommendations.map((recommendation) => {
              const existing = existingByRecommendation.get(recommendation.key);
              return (
                <article className={styles.recommendationCard} key={recommendation.key}>
                  <div className={styles.recommendationTopline}>
                    <span>Prioridade {recommendation.priority}</span>
                    <span>{recommendation.ruleId}@{recommendation.ruleVersion}</span>
                  </div>
                  <h4>{recommendation.title}</h4>
                  <p>{recommendation.rationale}</p>
                  <details className={styles.explainability}>
                    <summary>Por quê, evidências e checklist</summary>
                    <div className={styles.explainabilityGrid}>
                      <div>
                        <strong>Evidências</strong>
                        <ul>{recommendation.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                      <div>
                        <strong>Checklist sugerido</strong>
                        <ol>{recommendation.checklist.map((item) => <li key={item}>{item}</li>)}</ol>
                      </div>
                    </div>
                  </details>
                  {existing ? (
                    <span className={styles.actionStatus} data-status={existing.status}>{statusLabels[existing.status]}</span>
                  ) : (
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={busyKey === `create:${recommendation.key}`}
                      onClick={() => materialize(recommendation.key)}
                    >
                      {busyKey === `create:${recommendation.key}` ? "Criando…" : "Criar ação"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className={styles.actionColumnTitle}>Fila operacional</h3>
          <div className={styles.actionStack}>
            {actions.length === 0 ? (
              <div className={styles.emptyBox}>Nenhuma ação humana foi materializada neste workspace.</div>
            ) : actions.map((action) => (
              <article className={styles.workItemCard} key={action.id}>
                <div className={styles.recommendationTopline}>
                  <span className={styles.actionStatus} data-status={action.status}>{statusLabels[action.status]}</span>
                  <span>Prioridade {action.priority}</span>
                </div>
                <h4>{action.title}</h4>
                <p>{action.rationale}</p>
                <div className={styles.workMeta}>
                  <span>Responsável: {action.responsibleUserId ?? "não definido"}</span>
                  <span>Regra: {action.ruleId}@{action.ruleVersion}</span>
                </div>
                <div className={styles.actionButtons}>
                  {nextStatuses(action.status).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === "REJECTED" ? styles.secondaryButton : styles.primaryButton}
                      disabled={busyKey === `transition:${action.id}:${status}`}
                      onClick={() => transition(action.id, status)}
                    >
                      {transitionLabel(status)}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function nextStatuses(status: GrowthActionStatus): GrowthActionStatus[] {
  switch (status) {
    case "OPEN": return ["ACCEPTED", "REJECTED"];
    case "ACCEPTED": return ["IN_PROGRESS", "REJECTED"];
    case "IN_PROGRESS": return ["COMPLETED", "REJECTED"];
    case "COMPLETED":
    case "REJECTED":
      return [];
  }
}

function transitionLabel(status: GrowthActionStatus): string {
  switch (status) {
    case "ACCEPTED": return "Aceitar";
    case "IN_PROGRESS": return "Iniciar execução";
    case "COMPLETED": return "Concluir";
    case "REJECTED": return "Rejeitar";
    case "OPEN": return "Reabrir";
  }
}

function upsertAction(actions: GrowthActionItem[], next: GrowthActionItem): GrowthActionItem[] {
  const exists = actions.some((action) => action.id === next.id);
  if (!exists) return [next, ...actions];
  return actions.map((action) => action.id === next.id ? next : action);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Falha ${response.status}`;
  } catch {
    return `Falha ${response.status}`;
  }
}
