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

Status: primeira versão implementada e integrada à `main`.

- cada KPI mostra valor atual, valor anterior, delta e variação percentual;
- eventos também recebem comparação contra baseline;
- baseline usado é explicitado na interface;
- denominador zero nunca gera percentual infinito: o estado é apresentado como novo baseline;
- nenhuma meta, previsão ou recomendação é inventada.

## INT-04 — Semantic Interpretation

Status: implementado neste incremento.

- o `direction` do Sector Pack é a fonte canônica para interpretação;
- `up` e `down` descrevem movimento, enquanto `improved` e `worsened` descrevem resultado;
- métricas `contextual` nunca recebem julgamento positivo/negativo automático;
- ausência de baseline e métrica ausente no pack permanecem estados explícitos;
- o manifest versionado é carregado e validado diretamente de `sector-packs/<id>/manifest.json`.

## INT-05 — Effective-Dated Metric Goals

Status: fundação persistente implementada neste incremento.

- metas são escopadas por workspace, Sector Pack, versão, métrica e moeda;
- `valid_from` e `valid_to` permitem histórico e troca de meta sem destruir contexto anterior;
- a meta ativa é resolvida na data final do período analisado;
- `target attainment` respeita a direção da métrica;
- target zero não gera porcentagem artificial;
- métricas contextuais podem ter target armazenado, mas não recebem julgamento automático de cumprimento;
- somente o último Sector Pack `COMMITTED` do workspace pode governar a interpretação.

## INT-06 — Interpreted Command Center

Status: camada de domínio implementada; UI é o próximo incremento.

Pipeline:

`comparação numérica → pack versionado → direção semântica → meta vigente → outcome/attainment`

A camada enriquecida produz, para cada KPI:

- movimento (`up`, `down`, `flat`, `no-baseline`);
- resultado (`improved`, `worsened`, `neutral`, `context-required`, `no-baseline`);
- direção declarada pelo pack;
- meta vigente, quando houver;
- gap absoluto;
- percentual de atingimento quando matematicamente e semanticamente válido.

## Próximos incrementos

- expor a interpretação e as metas na UI do Command Center;
- endpoint seguro para criação/edição de metas com permissão própria;
- modelar `MetricGoal` também no schema Prisma para eliminar acesso SQL dedicado;
- séries temporais e tendências multi-período;
- sinais operacionais e prioridades explicáveis.

## Critério de saída

Um usuário autorizado deve conseguir distinguir movimento de desempenho, comparar o período selecionado com um baseline equivalente e avaliar metas reais do workspace sem mistura de tenant, sem porcentagens inválidas e sem inferência semântica não declarada.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
