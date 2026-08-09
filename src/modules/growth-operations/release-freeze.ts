export type ReleaseFreezeDecision = "ALLOWED" | "REVIEW_REQUIRED" | "BLOCKED_FOR_RC";
export type ReleaseFreezeChangeKind =
  | "DOCUMENTATION"
  | "TEST_ONLY"
  | "PROVIDER_CERTIFICATION"
  | "SECURITY_FIX"
  | "RELEASE_BLOCKER_FIX"
  | "CORE_FEATURE"
  | "SCHEMA_CHANGE"
  | "UNKNOWN";

export const PRODUCTION_CANDIDATE_FREEZE = Object.freeze({
  version: "1.0.0-rc.1-core",
  channel: "PRODUCTION_CANDIDATE_CORE",
  status: "FROZEN",
  signature: "Tehkné Solutions",
  promotionTarget: "1.0.0",
  providerCertificationRequired: true,
  goldenPathRequired: true,
});

export type ReleaseFreezeAssessment = Readonly<{
  decision: ReleaseFreezeDecision;
  kind: ReleaseFreezeChangeKind;
  reason: string;
  requiredEvidence: readonly string[];
}>;

const ALLOWED: ReadonlySet<ReleaseFreezeChangeKind> = new Set([
  "DOCUMENTATION",
  "TEST_ONLY",
  "PROVIDER_CERTIFICATION",
]);

const REVIEW_REQUIRED: ReadonlySet<ReleaseFreezeChangeKind> = new Set([
  "SECURITY_FIX",
  "RELEASE_BLOCKER_FIX",
]);

export function assessReleaseFreezeChange(kind: ReleaseFreezeChangeKind): ReleaseFreezeAssessment {
  if (ALLOWED.has(kind)) {
    return {
      decision: "ALLOWED",
      kind,
      reason: kind === "PROVIDER_CERTIFICATION"
        ? "Mudança necessária para concluir a certificação externa sem alterar o escopo funcional do Core congelado."
        : "Mudança não altera o escopo funcional certificado do Production Candidate Core.",
      requiredEvidence: ["CI completo verde"],
    };
  }

  if (REVIEW_REQUIRED.has(kind)) {
    return {
      decision: "REVIEW_REQUIRED",
      kind,
      reason: "Mudança excepcional permitida somente para segurança ou bloqueador comprovado do release.",
      requiredEvidence: [
        "CI completo verde",
        "descrição explícita do risco/bloqueador",
        "smoke do Core após deploy",
        "plano de rollback confirmado",
      ],
    };
  }

  return {
    decision: "BLOCKED_FOR_RC",
    kind,
    reason: "O Production Candidate Core está congelado; novas features, mudanças de schema não essenciais ou alterações indefinidas devem ir para o ciclo pós-1.0.",
    requiredEvidence: ["replanejar para pós-1.0 ou reabrir formalmente o freeze"],
  };
}

export function canPromoteFullProduction(input: Readonly<{
  strictProductionReady: boolean;
  providersCertified: number;
  totalProviders: number;
  smokePassed: boolean;
  goldenPathVerified: boolean;
}>): boolean {
  return input.strictProductionReady
    && input.totalProviders > 0
    && input.providersCertified === input.totalProviders
    && input.smokePassed
    && input.goldenPathVerified;
}
