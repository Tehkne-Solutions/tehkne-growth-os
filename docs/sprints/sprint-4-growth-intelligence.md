# Sprint 4 — Growth Intelligence

## Objetivo

Evoluir o Command Center de leitura operacional para interpretação comparativa, mantendo dados reais, isolamento tenant-aware e ausência de KPIs simulados.

## INT-01 — Period Comparison

Status: implementado e integrado à `main`.

- janela anterior imediatamente adjacente com duração equivalente;
- comparação por `metricId + currency`;
- delta absoluto;
- variação percentual;
- estados `up`, `down`, `flat` e `no-baseline`;
- métricas existentes somente em um dos períodos continuam visíveis;
- comparação entre workspaces diferentes é rejeitada.

## INT-02 — Authorized Intelligence Query

Status: implementado e integrado à `main`.

- uma única autorização `growth.command_center.read` antecede qualquer leitura;
- período atual e anterior usam sempre o mesmo `workspaceId` autorizado;
- snapshots são carregados em paralelo após autorização;
- testes verificam autorização única e escopo das duas queries.

## INT-03 — Comparative Command Center UI

Status: implementado e integrado à `main`.

- cada KPI mostra valor atual, valor anterior, delta e variação percentual;
- eventos também recebem comparação contra baseline;
- denominador zero nunca gera percentual infinito;
- nenhuma meta, previsão ou recomendação é inventada.

## INT-04 — Semantic Interpretation

Status: implementado e integrado à `main`.

- `direction` do Sector Pack é a fonte canônica para interpretação;
- movimento e resultado permanecem conceitos separados;
- métricas `contextual` nunca recebem julgamento automático;
- manifests reais suportam IDs canônicos em `snake_case`.

## INT-05 — Effective-Dated Metric Goals

Status: implementado e integrado à `main`.

- metas escopadas por workspace, Sector Pack, versão, métrica e moeda;
- histórico por `valid_from` / `valid_to`;
- target attainment respeita a direção semântica;
- target zero não gera porcentagem artificial.

## INT-06 — Interpreted Command Center

Status: implementado e integrado à `main`.

Pipeline: `comparação numérica → pack versionado → direção semântica → meta vigente → outcome/attainment`.

## INT-07 — Prisma MetricGoal

Status: implementado e integrado à `main`.

## INT-08 — Goal Management Permission

Status: implementado e integrado à `main`.

## INT-09 — Audited Goal Mutation

Status: implementado e integrado à `main`.

## INT-10 — Goal Mutation Coverage

Status: implementado e integrado à `main`.

## INT-11 — Goals UI

Status: implementado e integrado à `main`.

## INT-12 — Decision Signals

Status: implementado e integrado à `main`.

## INT-13 — Time Series & Momentum

Status: implementado e integrado à `main`.

- seis janelas equivalentes e adjacentes compõem a série padrão;
- tendência numérica é classificada como `rising`, `falling`, `flat`, `mixed` ou `insufficient-data`;
- momentum é classificado como `accelerating`, `decelerating`, `steady`, `reversal` ou `insufficient-data`;
- desempenho usa o `direction` do Sector Pack e continua separado da direção numérica;
- todas as janelas históricas reutilizam exclusivamente o workspace já autorizado.

## INT-14 — Momentum UI & Sparklines

Status: implementado neste incremento.

- cada KPI recebe sparkline SVG server-side com as seis janelas equivalentes;
- tendência, momentum e performance momentum aparecem no próprio card;
- a visualização não cria uma nova fonte de dados nem roda lógica de negócio no cliente;
- piora acelerando gera sinal adicional de trajetória;
- melhora acelerando gera confirmação positiva;
- reversão gera sinal contextual de mudança de regime;
- sinais de meta continuam com prioridade superior aos sinais de momentum;
- nenhuma reversão é classificada automaticamente como boa ou ruim.

## Próximos incrementos

- playbooks declarativos e recomendações explicáveis;
- persistência opcional de sinais para histórico operacional;
- regras de severidade configuráveis por Sector Pack;
- visão executiva cross-workspace com RBAC próprio.

## Critério de saída

Um usuário autorizado deve conseguir distinguir movimento, desempenho, meta e trajetória multi-período no mesmo Command Center, com sinais determinísticos, isolamento tenant-aware e sem inferência semântica não declarada.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
