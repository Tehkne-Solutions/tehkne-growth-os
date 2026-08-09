import type { UnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import type { ProductionReadinessSnapshot } from "@/modules/growth-operations/production-readiness";

export type ProviderCertificationStage =
  | "CREDENTIALS_REQUIRED"
  | "READY_TO_CONNECT"
  | "FIRST_SYNC_REQUIRED"
  | "CERTIFIED";

export type ProviderCertificationHandoff = Readonly<{
  provider: "GOOGLE_ADS" | "META_ADS" | "HUBSPOT";
  label: string;
  stage: ProviderCertificationStage;
  blockingInputs: readonly string[];
  nextActions: readonly string[];
  evidenceRequired: readonly string[];
}>;

export type ProviderCertificationHandoffPack = Readonly<{
  readyForFullCertification: boolean;
  certifiedProviders: number;
  totalProviders: number;
  providers: readonly ProviderCertificationHandoff[];
  finalActions: readonly string[];
  signature: "Tehkné Solutions";
}>;

const EVIDENCE: Record<ProviderCertificationHandoff["provider"], readonly string[]> = {
  GOOGLE_ADS: [
    "OAuth concluído com conta Google real.",
    "Conta Google Ads selecionada explicitamente.",
    "Conexão ACTIVE.",
    "Primeiro sync concluído com last_success_at e watermark persistidos.",
    "Freshness sem falha crítica no Production Readiness.",
  ],
  META_ADS: [
    "OAuth concluído com conta Meta real.",
    "Ad Account selecionada explicitamente.",
    "Conexão ACTIVE.",
    "Primeiro sync concluído com last_success_at e watermark persistidos.",
    "Freshness sem falha crítica no Production Readiness.",
  ],
  HUBSPOT: [
    "Credencial HubSpot validada em leitura.",
    "Portal ID e propriedades de atribuição confirmados.",
    "Conexão ACTIVE.",
    "Primeiro sync concluído com last_success_at e watermark persistidos.",
    "Leads, opportunities e revenue disponíveis para o full funnel.",
  ],
};

export function buildProviderCertificationHandoffPack(
  onboarding: UnifiedOnboardingReadiness,
  production: ProductionReadinessSnapshot,
): ProviderCertificationHandoffPack {
  const providers = onboarding.providers.map<ProviderCertificationHandoff>((provider) => {
    const stage: ProviderCertificationStage = !provider.infrastructureReady
      ? "CREDENTIALS_REQUIRED"
      : provider.activeConnectionCount === 0
        ? "READY_TO_CONNECT"
        : provider.firstSyncVerified
          ? "CERTIFIED"
          : "FIRST_SYNC_REQUIRED";

    return {
      provider: provider.provider,
      label: provider.label,
      stage,
      blockingInputs: stage === "CREDENTIALS_REQUIRED" ? provider.missing : [],
      nextActions: nextActions(provider.provider, stage),
      evidenceRequired: EVIDENCE[provider.provider],
    };
  });

  const certifiedProviders = providers.filter((provider) => provider.stage === "CERTIFIED").length;
  const readyForFullCertification =
    certifiedProviders === providers.length &&
    onboarding.productionReady &&
    production.status === "ready";

  return {
    readyForFullCertification,
    certifiedProviders,
    totalProviders: providers.length,
    providers,
    finalActions: readyForFullCertification
      ? [
          "Executar o smoke final do Release Candidate contra Production.",
          "Registrar evidências do golden path Ads → CRM → Full Funnel → Attribution → Alert → Webhook → Ledger.",
          "Promover Full Production Certification 1.0 somente se todos os gates permanecerem verdes.",
        ]
      : [
          "Completar somente os inputs externos explicitamente listados para cada provider.",
          "Conectar uma conta real e executar first-sync para cada provider ainda não certificado.",
          "Reexecutar Production Readiness até o status global ser ready.",
        ],
    signature: "Tehkné Solutions",
  };
}

function nextActions(
  provider: ProviderCertificationHandoff["provider"],
  stage: ProviderCertificationStage,
): readonly string[] {
  if (stage === "CERTIFIED") {
    return ["Monitorar freshness, scheduler e erros críticos; não repetir onboarding sem necessidade."];
  }
  if (stage === "FIRST_SYNC_REQUIRED") {
    return [
      "Executar sincronização da conexão ACTIVE.",
      "Confirmar last_success_at e watermark persistidos.",
      "Revalidar Production Readiness após o sync.",
    ];
  }
  if (stage === "READY_TO_CONNECT") {
    if (provider === "HUBSPOT") {
      return [
        "Abrir Setup e cadastrar a conexão HubSpot real.",
        "Validar Portal ID e mapeamento de propriedades.",
        "Executar first-sync e confirmar watermark.",
      ];
    }
    return [
      "Abrir Setup e iniciar OAuth do provider.",
      "Selecionar explicitamente a conta de mídia correta.",
      "Executar first-sync e confirmar watermark.",
    ];
  }
  if (provider === "GOOGLE_ADS") {
    return [
      "Armazenar Developer Token e OAuth Client no vault pelos controles do Setup.",
      "Confirmar GOOGLE_ADS_API_VERSION no runtime.",
      "Reabrir o Setup; o provider deve avançar para READY_TO_CONNECT.",
    ];
  }
  if (provider === "META_ADS") {
    return [
      "Armazenar OAuth Client da Meta no vault pelos controles do Setup.",
      "Confirmar META_GRAPH_API_VERSION no runtime.",
      "Reabrir o Setup; o provider deve avançar para READY_TO_CONNECT.",
    ];
  }
  return [
    "Confirmar CONNECTOR_SECRET_MASTER_KEY no runtime.",
    "Reabrir o Setup e cadastrar a conexão HubSpot real.",
  ];
}
