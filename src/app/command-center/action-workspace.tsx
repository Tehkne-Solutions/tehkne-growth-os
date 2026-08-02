"use client";

import { useMemo, useState } from "react";

import type { ActionEffectivenessRecord, ActionEffectivenessOutcome } from "@/modules/growth-intelligence/action-effectiveness";
import type { GrowthActionItem, GrowthActionStatus } from "@/modules/growth-intelligence/action-workflow";
import type { PlaybookRecommendation } from "@/modules/growth-intelligence/playbook-engine";
import type { EffectivenessSummary } from "@/modules/growth-intelligence/playbook-effectiveness";

import styles from "./action-workspace.module.css";

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
  initialOutcomes: readonly ActionEffectivenessRecord[];
  initialEffectiveness: EffectivenessSummary;
}>;

const statusLabels: Record<GrowthActionStatus, string> = {
  OPEN: "Aberta",
  ACCEPTED: "Aceita",
  IN_PROGRESS: "Em execução",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
};

const outcomeLabels: Record<ActionEffectivenessOutcome, string> = {
  IMPROVED: "Melhorou",
  WORSENED: "Piorou",
  NEUTRAL: "Neutro",
  CONTEXT_REQUIRED: "Requer contexto",
  INSUFFICIENT_DATA: "Dados insuficientes",
};

export function ActionWorkspace({
  tenant,
  from,
  to,
  recommendations,
  initialActions,
  initialOutcomes,
  initialEffectiveness,
}: ActionWorkspaceProps) {
  const [actions, setActions] = useState(() => [...initialActions]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existingByRecommendation = useMemo(
    () => new Map(actions.map((action) => [action.recommendationKey, action])),
    [actions],
  );
  const outcomesByAction = useMemo(() => {
    const map = new Map<string, ActionEffectivenessRecord[]>();
    for (const outcome of initialOutcomes) {
      const list = map.get(outcome.actionItemId) ?? [];
      list.push(outcome);
      map.set(outcome.actionItemId, list);
    }
    return map;
  }, [initialOutcomes]);
  const ruleLearning = useMemo(() => buildRuleLearning(actions, initialOutcomes), [actions, initialOutcomes]);

  async function materialize(recommendationKey: string) {
    const key = `create:${recommendationKey}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/growth/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "materialize", tenant, recommendationKey, from, to }),
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
        body: JSON.stringify({ intent: "transition", tenant, actionId, status }),
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
    <section aria-label="Playbooks e ações humanas">
      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <div className={styles.stack}>
        <article className={styles.card}>
          <div className={styles.topline}>
            <span>Aprendizado de playbooks</span>
            <span>Associação temporal · causalidade não afirmada</span>
          </div>
          <h2 className={styles.columnTitle}>Efetividade observada</h2>
          <div className={styles.meta}>
            <span>Avaliações: {initialEffectiveness.evaluated}</span>
            <span>Melhoraram: {initialEffectiveness.improved}</span>
            <span>Pioraram: {initialEffectiveness.worsened}</span>
            <span>Neutras: {initialEffectiveness.neutral}</span>
            <span>Taxa observada: {formatRate(initialEffectiveness.improvementRate)}</span>
          </div>
          {ruleLearning.length === 0 ? (
            <p>Nenhuma regra possui avaliações julgáveis ainda.</p>
          ) : (
            <div className={styles.stack}>
              {ruleLearning.map((rule) => (
                <div className={styles.meta} key={rule.key}>
                  <strong>{rule.key}</strong>
                  <span>{rule.improved}/{rule.judged} avaliações melhoraram</span>
                  <span>{formatRate(rule.rate)}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className={styles.columns}>
        <div>
          <h2 className={styles.columnTitle}>Recomendações ativas</h2>
          <div className={styles.stack}>
            {recommendations.length === 0 ? (
              <div className={styles.empty}>Nenhuma recomendação declarativa está ativa para este período.</div>
            ) : recommendations.map((recommendation) => {
              const existing = existingByRecommendation.get(recommendation.key);
              return (
                <article className={styles.card} key={recommendation.key}>
                  <div className={styles.topline}>
                    <span>Prioridade {recommendation.priority}</span>
                    <span>{recommendation.ruleId}@{recommendation.ruleVersion}</span>
                  </div>
                  <h3>{recommendation.title}</h3>
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
                    <span className={styles.status} data-status={existing.status}>{statusLabels[existing.status]}</span>
                  ) : (
                    <button className={styles.primary} type="button" disabled={busyKey === keyForCreate(recommendation.key)} onClick={() => materialize(recommendation.key)}>
                      {busyKey === keyForCreate(recommendation.key) ? "Criando…" : "Criar ação"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className={styles.columnTitle}>Fila operacional</h2>
          <div className={styles.stack}>
            {actions.length === 0 ? (
              <div className={styles.empty}>Nenhuma ação humana foi materializada neste workspace.</div>
            ) : actions.map((action) => {
              const outcomes = outcomesByAction.get(action.id) ?? [];
              return (
                <article className={styles.card} key={action.id}>
                  <div className={styles.topline}>
                    <span className={styles.status} data-status={action.status}>{statusLabels[action.status]}</span>
                    <span>Prioridade {action.priority}</span>
                  </div>
                  <h3>{action.title}</h3>
                  <p>{action.rationale}</p>
                  <div className={styles.meta}>
                    <span>Responsável: {action.responsibleUserId ?? "não definido"}</span>
                    <span>Regra: {action.ruleId}@{action.ruleVersion}</span>
                  </div>
                  {outcomes.length > 0 ? (
                    <details className={styles.explainability}>
                      <summary>Resultados pós-ação ({outcomes.length})</summary>
                      <div className={styles.stack}>
                        {outcomes.map((outcome) => (
                          <div className={styles.meta} key={outcome.id}>
                            <strong>{outcome.metricId}: {outcomeLabels[outcome.outcome]}</strong>
                            <span>{formatNumber(outcome.baselineValue)} → {formatNumber(outcome.evaluationValue)}</span>
                            <span>Δ {formatSigned(outcome.percentageDelta)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : action.status === "COMPLETED" ? (
                    <p>Concluída, ainda sem avaliação pós-ação registrada.</p>
                  ) : null}
                  <div className={styles.actions}>
                    {nextStatuses(action.status).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={status === "REJECTED" ? styles.secondary : styles.primary}
                        disabled={busyKey === keyForTransition(action.id, status)}
                        onClick={() => transition(action.id, status)}
                      >
                        {transitionLabel(status)}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildRuleLearning(actions: readonly GrowthActionItem[], outcomes: readonly ActionEffectivenessRecord[]) {
  const ruleByAction = new Map(actions.map((action) => [action.id, `${action.ruleId}@${action.ruleVersion}`]));
  const grouped = new Map<string, { improved: number; judged: number }>();
  for (const outcome of outcomes) {
    if (outcome.outcome !== "IMPROVED" && outcome.outcome !== "WORSENED" && outcome.outcome !== "NEUTRAL") continue;
    const key = ruleByAction.get(outcome.actionItemId);
    if (!key) continue;
    const current = grouped.get(key) ?? { improved: 0, judged: 0 };
    current.judged += 1;
    if (outcome.outcome === "IMPROVED") current.improved += 1;
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, counts]) => ({ key, ...counts, rate: counts.judged === 0 ? null : (counts.improved / counts.judged) * 100 }))
    .sort((a, b) => b.judged - a.judged || b.improved - a.improved || a.key.localeCompare(b.key));
}

function keyForCreate(recommendationKey: string): string {
  return `create:${recommendationKey}`;
}

function keyForTransition(actionId: string, status: GrowthActionStatus): string {
  return `transition:${actionId}:${status}`;
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

function formatRate(value: number | null): string {
  return value === null ? "sem base julgável" : `${value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatSigned(value: number | null): string {
  if (value === null) return "sem baseline percentual";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Falha ${response.status}`;
  } catch {
    return `Falha ${response.status}`;
  }
}
