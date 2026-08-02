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
- manifests reais suportam IDs canônicos de métricas, eventos e stages em `snake_case`.

## INT-05 — Effective-Dated Metric Goals

Status: implementado e integrado à `main`.

- metas escopadas por workspace, Sector Pack, versão, métrica e moeda;
- histórico por `valid_from` / `valid_to`;
- target attainment respeita a direção semântica;
- target zero não gera porcentagem artificial.

## INT-06 — Interpreted Command Center

Status: implementado e integrado à `main`.

Pipeline:

`comparação numérica → pack versionado → direção semântica → meta vigente → outcome/attainment`

## INT-07 — Prisma MetricGoal

Status: implementado e integrado à `main`.

- `MetricGoal` espelhado no schema Prisma;
- relação explícita com `Workspace`;
- leituras de meta migradas de SQL dedicado para Prisma.

## INT-08 — Goal Management Permission

Status: implementado e integrado à `main`.

- permissão `growth.goals.manage` persistida no catálogo;
- workspace bruto nunca é tratado como autorização.

## INT-09 — Audited Goal Mutation

Status: implementado e integrado à `main`.

- `POST /api/growth/goals` protegido por same-origin, sessão, tenant e RBAC;
- métrica validada contra o último Sector Pack `COMMITTED`;
- meta anterior é fechada antes de uma nova entrar em vigor;
- meta e `AuditEvent` são persistidos na mesma transação.

## INT-10 — Goal Mutation Coverage

Status: implementado e integrado à `main`.

- testes de autorização antecipada;
- métrica inválida rejeitada;
- criação transacional de meta + auditoria;
- manifest real do pack Education validado pelo gate.

## INT-11 — Goals UI

Status: implementado neste incremento.

- cada KPI mostra Meta, Gap e Atingimento;
- outcome semântico é apresentado como Melhorou, Piorou, Estável ou Requer contexto;
- editor contextual permite definir ou substituir a meta sem JSON/API manual;
- o editor reutiliza a API segura existente e nunca recebe liberdade para escolher Sector Pack arbitrário.

## INT-12 — Decision Signals

Status: implementado neste incremento.

- sinais derivados exclusivamente de `InterpretedCommandCenterMetric`;
- prioridade determinística e explicável;
- `worsened + not-met` recebe prioridade crítica;
- `not-met` e `worsened` isolados recebem warning;
- `improved + met` gera sinal positivo;
- métricas contextuais continuam explicitamente sem julgamento;
- nenhum texto de sinal depende de LLM ou recomendação inventada.

## Próximos incrementos

- séries temporais multi-período;
- persistência opcional de sinais para histórico operacional;
- regras de severidade configuráveis por Sector Pack;
- recomendações explicáveis baseadas em playbooks declarativos;
- visão executiva cross-workspace com RBAC próprio.

## Critério de saída

Um usuário autorizado deve conseguir distinguir movimento de desempenho, comparar o período selecionado com baseline equivalente, avaliar e administrar metas reais do workspace e identificar prioridades derivadas de regras explícitas, sem mistura de tenant, porcentagens inválidas ou inferência semântica não declarada.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
