# Sprint 4 — Growth Intelligence

## Objetivo

Evoluir o Command Center de leitura operacional para interpretação comparativa, mantendo dados reais, isolamento tenant-aware e ausência de KPIs simulados.

## INT-01 — Period Comparison

Status: implementado neste incremento.

- janela anterior imediatamente adjacente com duração equivalente;
- comparação por `metricId + currency`;
- delta absoluto;
- variação percentual;
- estados `up`, `down`, `flat` e `no-baseline`;
- métricas existentes somente em um dos períodos continuam visíveis;
- comparação entre workspaces diferentes é rejeitada.

## INT-02 — Authorized Intelligence Query

Status: implementado neste incremento.

- uma única autorização `growth.command_center.read` antecede qualquer leitura;
- período atual e anterior usam sempre o mesmo `workspaceId` autorizado;
- snapshots são carregados em paralelo após autorização;
- testes verificam autorização única e escopo das duas queries.

## INT-03 — Comparative Command Center UI

Status: primeira versão implementada neste incremento.

- cada KPI mostra valor atual, valor anterior, delta e variação percentual;
- eventos também recebem comparação contra baseline;
- baseline usado é explicitado na interface;
- denominador zero nunca gera percentual infinito: o estado é apresentado como novo baseline;
- nenhuma meta, previsão ou recomendação é inventada.

## Próximos incrementos

- metas persistidas por workspace e métrica;
- direção desejável herdada do Sector Pack;
- interpretação de variação como positiva/negativa somente quando houver semântica suficiente;
- séries temporais e tendências multi-período;
- sinais operacionais e prioridades explicáveis.

## Critério de saída

Um usuário autorizado deve conseguir comparar o período selecionado com uma janela anterior equivalente e distinguir mudança real de ausência de baseline, sem mistura de workspace e sem inferência semântica não declarada.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
