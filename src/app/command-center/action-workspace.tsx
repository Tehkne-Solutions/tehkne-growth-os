"use client";

import { useMemo, useState } from "react";

import type { ActionEffectivenessRecord, ActionEffectivenessOutcome } from "@/modules/growth-intelligence/action-effectiveness";
import type { GrowthActionItem, GrowthActionStatus } from "@/modules/growth-intelligence/action-workflow";
import type { PlaybookRecommendation } from "@/modules/growth-intelligence/playbook-engine";
import { summarizeEffectiveness, type EffectivenessSummary } from "@/modules/growth-intelligence/playbook-effectiveness";
import type { PlaybookReviewProposal, PlaybookReviewStatus } from "@/modules/growth-intelligence/playbook-review";

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
  initialReviewProposals: readonly PlaybookReviewProposal[];
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

const reviewLabels: Record<PlaybookReviewStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Em revisão",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
};

export function ActionWorkspace({
  tenant,
  from,
  to,
  recommendations,
  initialActions,
  initialOutcomes,
  initialEffectiveness,
  initialReviewProposals,
}: ActionWorkspaceProps) {
  const [actions, setActions] = useState(() => [...initialActions]);
  const [outcomes, setOutcomes] = useState(() => [...initialOutcomes]);
  const [reviewProposals, setReviewProposals] = useState(() => [...initialReviewProposals]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveness = useMemo(
    () => outcomes.length === initialOutcomes.length && outcomes.every((item, index) => item.id === initialOutcomes[index]?.id)
      ? initialEffectiveness
      : summarizeEffectiveness(outcomes),
    [initialEffectiveness, initialOutcomes, outcomes],
  );
  const existingByRecommendation = useMemo(
    () => new Map(actions.map((action) => [action.recommendationKey, action])),
    [actions],
  );
  const outcomesByAction = useMemo(() => groupOutcomesByAction(outcomes), [outcomes]);
  const ruleLearning = useMemo(() => buildRuleLearning(actions, outcomes), [actions, outcomes]);

  async function materialize(recommendationKey: string) {
    const key = `create:${recommendationKey}`;
    await perform(key, async () => {
      const response = await fetch("/api/growth/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "materialize", tenant, recommendationKey, from, to }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const action = await response.json() as GrowthActionItem;
      setActions((current) => upsertAction(current, action));
    });
  }

  async function transition(actionId: string, status: GrowthActionStatus) {
    const key = `transition:${actionId}:${status}`;
    await perform(key, async () => {
      const response = await fetch("/api/growth/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "transition", tenant, actionId, status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const action = await response.json() as GrowthActionItem;
      setActions((current) => upsertAction(current, action));
    });
  }

  async function evaluate(input: EvaluationInput) {
    const key = `evaluate:${input.actionItemId}:${input.metricId}:${input.currency ?? ""}`;
    await perform(key, async () => {
      const response = await fetch("/api/growth/action-effectiveness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, ...input }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const outcome = await response.json() as ActionEffectivenessRecord;
      setOutcomes((current) => upsertOutcome(current, outcome));
    });
  }

  async function createReview(action: GrowthActionItem, input: ReviewDraftInput) {
    const key = `review:create:${action.id}`;
    await perform(key, async () => {
      const actionOutcomes = outcomesByAction.get(action.id) ?? [];
      const response = await fetch("/api/growth/playbook-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "create",
          tenant,
          sectorPackId: action.sectorPackId,
          sectorPackVersion: action.sectorPackVersion,
          ruleId: action.ruleId,
          ruleVersion: action.ruleVersion,
          title: input.title,
          rationale: input.rationale,
          proposedChange: { summary: input.proposedChange },
          evidenceSnapshot: {
            actionItemId: action.id,
            outcomes: actionOutcomes.map((item) => ({
              metricId: item.metricId,
              outcome: item.outcome,
              percentageDelta: item.percentageDelta,
            })),
            causality: "not_asserted",
          },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const proposal = await response.json() as PlaybookReviewProposal;
      setReviewProposals((current) => upsertProposal(current, proposal));
    });
  }

  async function transitionReview(proposalId: string, status: Exclude<PlaybookReviewStatus, "DRAFT">) {
    const key = `review:${proposalId}:${status}`;
    await perform(key, async () => {
      const response = await fetch("/api/growth/playbook-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "transition", tenant, proposalId, status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const proposal = await response.json() as PlaybookReviewProposal;
      setReviewProposals((current) => upsertProposal(current, proposal));
    });
  }

  async function perform(key: string, callback: () => Promise<void>) {
    setBusyKey(key);
    setError(null);
    try {
      await callback();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A operação não pôde ser concluída.");
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
            <span>Avaliações: {effectiveness.evaluated}</span>
            <span>Melhoraram: {effectiveness.improved}</span>
            <span>Pioraram: {effectiveness.worsened}</span>
            <span>Neutras: {effectiveness.neutral}</span>
            <span>Taxa observada: {formatRate(effectiveness.improvementRate)}</span>
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

        <article className={styles.card}>
          <div className={styles.topline}>
            <span>Governança de playbooks</span>
            <span>Nenhuma proposta aprovada é publicada automaticamente</span>
          </div>
          <h2 className={styles.columnTitle}>Fila de revisão</h2>
          {reviewProposals.length === 0 ? <p>Nenhuma proposta de revisão foi criada.</p> : (
            <div className={styles.stack}>
              {reviewProposals.map((proposal) => (
                <div className={styles.reviewItem} key={proposal.id}>
                  <div className={styles.topline}>
                    <span className={styles.status} data-status={proposal.status}>{reviewLabels[proposal.status]}</span>
                    <span>{proposal.ruleId}@{proposal.ruleVersion}</span>
                  </div>
                  <strong>{proposal.title}</strong>
                  <p>{proposal.rationale}</p>
                  <div className={styles.actions}>
                    {reviewTransitions(proposal.status).map((status) => (
                      <button
                        className={status === "REJECTED" ? styles.secondary : styles.primary}
                        disabled={busyKey === `review:${proposal.id}:${status}`}
                        key={status}
                        onClick={() => transitionReview(proposal.id, status)}
                        type="button"
                      >
                        {reviewTransitionLabel(status)}
                      </button>
                    ))}
                  </div>
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
              const actionOutcomes = outcomesByAction.get(action.id) ?? [];
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
                  {actionOutcomes.length > 0 ? (
                    <details className={styles.explainability}>
                      <summary>Resultados pós-ação ({actionOutcomes.length})</summary>
                      <div className={styles.stack}>
                        {actionOutcomes.map((outcome) => (
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

                  {action.status === "COMPLETED" ? (
                    <>
                      <EvaluationForm
                        actionId={action.id}
                        busy={busyKey?.startsWith(`evaluate:${action.id}:`) ?? false}
                        defaultFrom={from}
                        defaultTo={to}
                        onSubmit={evaluate}
                      />
                      <ReviewProposalForm
                        action={action}
                        busy={busyKey === `review:create:${action.id}`}
                        onSubmit={(input) => createReview(action, input)}
                      />
                    </>
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

type EvaluationInput = {
  actionItemId: string;
  metricId: string;
  currency?: string;
  baselineFrom: string;
  baselineTo: string;
  evaluationFrom: string;
  evaluationTo: string;
};

function EvaluationForm({
  actionId,
  busy,
  defaultFrom,
  defaultTo,
  onSubmit,
}: Readonly<{
  actionId: string;
  busy: boolean;
  defaultFrom: string;
  defaultTo: string;
  onSubmit: (input: EvaluationInput) => Promise<void>;
}>) {
  const defaults = equivalentEvaluationDefaults(defaultFrom, defaultTo);
  const [metricId, setMetricId] = useState("");
  const [currency, setCurrency] = useState("");
  const [baselineFrom, setBaselineFrom] = useState(defaults.baselineFrom);
  const [baselineTo, setBaselineTo] = useState(defaults.baselineTo);
  const [evaluationFrom, setEvaluationFrom] = useState(defaults.evaluationFrom);
  const [evaluationTo, setEvaluationTo] = useState(defaults.evaluationTo);

  return (
    <details className={styles.explainability}>
      <summary>Registrar avaliação pós-ação</summary>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          if (!metricId.trim()) return;
          void onSubmit({
            actionItemId: actionId,
            metricId: metricId.trim(),
            ...(currency.trim() ? { currency: currency.trim() } : {}),
            baselineFrom: toUtcStart(baselineFrom),
            baselineTo: toUtcEnd(baselineTo),
            evaluationFrom: toUtcStart(evaluationFrom),
            evaluationTo: toUtcEnd(evaluationTo),
          });
        }}
      >
        <label>Métrica<input required value={metricId} onChange={(event) => setMetricId(event.target.value)} placeholder="ex.: cpl" /></label>
        <label>Moeda<input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="BRL (opcional)" /></label>
        <label>Baseline início<input required type="date" value={baselineFrom} onChange={(event) => setBaselineFrom(event.target.value)} /></label>
        <label>Baseline fim<input required type="date" value={baselineTo} onChange={(event) => setBaselineTo(event.target.value)} /></label>
        <label>Avaliação início<input required type="date" value={evaluationFrom} onChange={(event) => setEvaluationFrom(event.target.value)} /></label>
        <label>Avaliação fim<input required type="date" value={evaluationTo} onChange={(event) => setEvaluationTo(event.target.value)} /></label>
        <button className={styles.primary} disabled={busy} type="submit">{busy ? "Avaliando…" : "Registrar avaliação"}</button>
      </form>
    </details>
  );
}

type ReviewDraftInput = { title: string; rationale: string; proposedChange: string };

function ReviewProposalForm({
  action,
  busy,
  onSubmit,
}: Readonly<{
  action: GrowthActionItem;
  busy: boolean;
  onSubmit: (input: ReviewDraftInput) => Promise<void>;
}>) {
  const [title, setTitle] = useState(`Revisar ${action.ruleId}@${action.ruleVersion}`);
  const [rationale, setRationale] = useState("");
  const [proposedChange, setProposedChange] = useState("");

  return (
    <details className={styles.explainability}>
      <summary>Propor revisão governada do playbook</summary>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || !rationale.trim() || !proposedChange.trim()) return;
          void onSubmit({ title: title.trim(), rationale: rationale.trim(), proposedChange: proposedChange.trim() });
        }}
      >
        <label>Título<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className={styles.fullWidth}>Por que revisar?<textarea required value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
        <label className={styles.fullWidth}>Mudança proposta<textarea required value={proposedChange} onChange={(event) => setProposedChange(event.target.value)} /></label>
        <button className={styles.secondary} disabled={busy} type="submit">{busy ? "Criando…" : "Criar proposta"}</button>
      </form>
    </details>
  );
}

function groupOutcomesByAction(outcomes: readonly ActionEffectivenessRecord[]) {
  const map = new Map<string, ActionEffectivenessRecord[]>();
  for (const outcome of outcomes) {
    const list = map.get(outcome.actionItemId) ?? [];
    list.push(outcome);
    map.set(outcome.actionItemId, list);
  }
  return map;
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

function reviewTransitions(status: PlaybookReviewStatus): Array<Exclude<PlaybookReviewStatus, "DRAFT">> {
  if (status === "DRAFT") return ["SUBMITTED"];
  if (status === "SUBMITTED") return ["APPROVED", "REJECTED"];
  return [];
}

function reviewTransitionLabel(status: Exclude<PlaybookReviewStatus, "DRAFT">) {
  if (status === "SUBMITTED") return "Enviar para revisão";
  if (status === "APPROVED") return "Aprovar proposta";
  return "Rejeitar proposta";
}

function equivalentEvaluationDefaults(from: string, to: string) {
  const baselineFromDate = new Date(from);
  const baselineToDate = new Date(to);
  const span = baselineToDate.getTime() - baselineFromDate.getTime();
  const evaluationFromDate = new Date(baselineToDate.getTime() + 1);
  const evaluationToDate = new Date(evaluationFromDate.getTime() + span);
  return {
    baselineFrom: dateInputValue(baselineFromDate),
    baselineTo: dateInputValue(baselineToDate),
    evaluationFrom: dateInputValue(evaluationFromDate),
    evaluationTo: dateInputValue(evaluationToDate),
  };
}

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toUtcStart(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toUtcEnd(value: string) {
  return `${value}T23:59:59.999Z`;
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

function upsertOutcome(outcomes: ActionEffectivenessRecord[], next: ActionEffectivenessRecord): ActionEffectivenessRecord[] {
  const identity = (item: ActionEffectivenessRecord) => `${item.actionItemId}:${item.metricId}:${item.currency ?? ""}`;
  const key = identity(next);
  const exists = outcomes.some((item) => identity(item) === key);
  if (!exists) return [next, ...outcomes];
  return outcomes.map((item) => identity(item) === key ? next : item);
}

function upsertProposal(proposals: PlaybookReviewProposal[], next: PlaybookReviewProposal): PlaybookReviewProposal[] {
  const exists = proposals.some((item) => item.id === next.id);
  if (!exists) return [next, ...proposals];
  return proposals.map((item) => item.id === next.id ? next : item);
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
