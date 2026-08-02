"use client";

import { useMemo, useState } from "react";

import type { DeclarativePlaybookRule } from "@/modules/growth-intelligence/playbooks";

import styles from "./publishing-workspace.module.css";

type ExplicitWorkspaceTenant = {
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
};

type PublicationStatus = "DRAFT" | "VALIDATED" | "PUBLISHED" | "REJECTED";

type PublicationCandidate = {
  id: string;
  proposalId: string;
  ruleId: string;
  baseRuleVersion: string;
  candidateRuleVersion: string;
  status: PublicationStatus;
  candidateRule: DeclarativePlaybookRule;
  structuredDiff: Record<string, unknown>;
  createdByUserId: string;
  validatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  validatedAt: string | null;
  publishedAt: string | null;
};

type ApprovedProposalDraft = {
  proposalId: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  rationale: string;
  proposedChange: Record<string, unknown>;
  candidateRule: DeclarativePlaybookRule;
};

type Props = Readonly<{
  tenant: ExplicitWorkspaceTenant;
  initialCandidates: readonly PublicationCandidate[];
  approvedProposalDrafts: readonly ApprovedProposalDraft[];
}>;

const labels: Record<PublicationStatus, string> = {
  DRAFT: "Candidato",
  VALIDATED: "Validado",
  PUBLISHED: "Publicado",
  REJECTED: "Rejeitado",
};

export function PublishingWorkspace({ tenant, initialCandidates, approvedProposalDrafts }: Props) {
  const [candidates, setCandidates] = useState(() => [...initialCandidates]);
  const [drafts, setDrafts] = useState(() => new Map(
    approvedProposalDrafts.map((proposal) => [proposal.proposalId, JSON.stringify(proposal.candidateRule, null, 2)]),
  ));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingProposalIds = useMemo(() => new Set(candidates.map((candidate) => candidate.proposalId)), [candidates]);
  const availableProposals = approvedProposalDrafts.filter((proposal) => !existingProposalIds.has(proposal.proposalId));
  const grouped = useMemo(() => groupByRule(candidates), [candidates]);

  async function createCandidate(proposalId: string) {
    const text = drafts.get(proposalId);
    if (!text) return;
    await perform(`create:${proposalId}`, async () => {
      const candidateRule = JSON.parse(text) as unknown;
      const response = await fetch("/api/growth/playbook-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "create", tenant, proposalId, candidateRule }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const candidate = await response.json() as PublicationCandidate;
      setCandidates((current) => upsertCandidate(current, candidate));
    });
  }

  async function transition(candidateId: string, status: Exclude<PublicationStatus, "DRAFT">) {
    await perform(`transition:${candidateId}:${status}`, async () => {
      const response = await fetch("/api/growth/playbook-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "transition", tenant, candidateId, status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const candidate = await response.json() as PublicationCandidate;
      setCandidates((current) => upsertCandidate(current, candidate));
    });
  }

  async function requestRollback(publishedCandidateId: string) {
    await perform(`rollback:${publishedCandidateId}`, async () => {
      const response = await fetch("/api/growth/playbook-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "rollback", tenant, publishedCandidateId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const candidate = await response.json() as PublicationCandidate;
      setCandidates((current) => upsertCandidate(current, candidate));
    });
  }

  async function perform(key: string, operation: () => Promise<void>) {
    setBusyKey(key);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A operação de publicação falhou.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className={styles.section} aria-label="Governança de publicação de playbooks">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Release Governance</p>
          <h2>Publicação controlada de playbooks</h2>
        </div>
        <p>Editar → validar → publicar. Rollbacks também passam pelo mesmo gate humano.</p>
      </div>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {availableProposals.length > 0 ? (
        <div className={styles.grid}>
          {availableProposals.map((proposal) => (
            <article className={styles.card} key={proposal.proposalId}>
              <div className={styles.topline}>
                <span>Proposta aprovada</span>
                <code>{proposal.ruleId}@{proposal.ruleVersion}</code>
              </div>
              <h3>{proposal.title}</h3>
              <p>{proposal.rationale}</p>
              <details>
                <summary>Mudança proposta e regra candidata</summary>
                <pre>{JSON.stringify(proposal.proposedChange, null, 2)}</pre>
                <label className={styles.editorLabel}>
                  JSON da regra candidata
                  <textarea
                    value={drafts.get(proposal.proposalId) ?? ""}
                    onChange={(event) => setDrafts((current) => {
                      const next = new Map(current);
                      next.set(proposal.proposalId, event.target.value);
                      return next;
                    })}
                    spellCheck={false}
                  />
                </label>
              </details>
              <button
                className={styles.primary}
                disabled={busyKey === `create:${proposal.proposalId}`}
                onClick={() => createCandidate(proposal.proposalId)}
                type="button"
              >
                Criar candidato versionado
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <div className={styles.empty}>Nenhum candidato de publicação existe neste workspace.</div>
      ) : (
        <div className={styles.ruleStack}>
          {grouped.map(([ruleId, history]) => (
            <article className={styles.releaseGroup} key={ruleId}>
              <div className={styles.groupHeading}>
                <div>
                  <span>Histórico da regra</span>
                  <h3>{ruleId}</h3>
                </div>
                <span>{history.length} versão(ões)</span>
              </div>
              <div className={styles.timeline}>
                {history.map((candidate) => (
                  <div className={styles.release} key={candidate.id}>
                    <div className={styles.topline}>
                      <span className={styles.status} data-status={candidate.status}>{labels[candidate.status]}</span>
                      <code>{candidate.baseRuleVersion} → {candidate.candidateRuleVersion}</code>
                      <span>{formatDate(candidate.publishedAt ?? candidate.validatedAt ?? candidate.createdAt)}</span>
                    </div>
                    <details className={styles.diff} open={candidate.status === "VALIDATED"}>
                      <summary>Diff estruturado</summary>
                      {Object.keys(candidate.structuredDiff).length === 0
                        ? <p>Sem diferenças estruturais.</p>
                        : <DiffView diff={candidate.structuredDiff} />}
                    </details>
                    <div className={styles.actions}>
                      {candidate.status === "DRAFT" ? (
                        <>
                          <button
                            className={styles.primary}
                            disabled={busyKey === `transition:${candidate.id}:VALIDATED`}
                            onClick={() => transition(candidate.id, "VALIDATED")}
                            type="button"
                          >Validar candidato</button>
                          <button
                            className={styles.secondary}
                            disabled={busyKey === `transition:${candidate.id}:REJECTED`}
                            onClick={() => transition(candidate.id, "REJECTED")}
                            type="button"
                          >Rejeitar</button>
                        </>
                      ) : null}
                      {candidate.status === "VALIDATED" ? (
                        <>
                          <button
                            className={styles.primary}
                            disabled={busyKey === `transition:${candidate.id}:PUBLISHED`}
                            onClick={() => transition(candidate.id, "PUBLISHED")}
                            type="button"
                          >Publicar versão</button>
                          <button
                            className={styles.secondary}
                            disabled={busyKey === `transition:${candidate.id}:REJECTED`}
                            onClick={() => transition(candidate.id, "REJECTED")}
                            type="button"
                          >Rejeitar</button>
                        </>
                      ) : null}
                      {candidate.status === "PUBLISHED" ? (
                        <button
                          className={styles.secondary}
                          disabled={busyKey === `rollback:${candidate.id}`}
                          onClick={() => requestRollback(candidate.id)}
                          type="button"
                        >Criar rollback governado</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DiffView({ diff }: Readonly<{ diff: Record<string, unknown> }>) {
  return (
    <div className={styles.diffGrid}>
      {Object.entries(diff).map(([field, value]) => {
        const pair = value as { before?: unknown; after?: unknown };
        return (
          <div className={styles.diffRow} key={field}>
            <strong>{field}</strong>
            <div><span>Antes</span><pre>{JSON.stringify(pair.before, null, 2)}</pre></div>
            <div><span>Depois</span><pre>{JSON.stringify(pair.after, null, 2)}</pre></div>
          </div>
        );
      })}
    </div>
  );
}

function groupByRule(candidates: readonly PublicationCandidate[]) {
  const groups = new Map<string, PublicationCandidate[]>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.ruleId) ?? [];
    list.push(candidate);
    groups.set(candidate.ruleId, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => Date.parse(right.publishedAt ?? right.validatedAt ?? right.createdAt) - Date.parse(left.publishedAt ?? left.validatedAt ?? left.createdAt));
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function upsertCandidate(current: readonly PublicationCandidate[], candidate: PublicationCandidate) {
  const found = current.some((item) => item.id === candidate.id);
  return found
    ? current.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...current];
}

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
