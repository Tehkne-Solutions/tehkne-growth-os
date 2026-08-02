# Sprint 3 — Command Center

## Objetivo

Transformar o Growth Data Core já integrado à `main` em uma camada operacional de leitura, com consultas tenant-aware e a primeira interface real do Tehkné Growth OS.

## Entregas

### CMD-01 — Migration do Growth Data Core

Status: implementado e integrado à `main`.

- migration PostgreSQL para `GrowthEvent`, `MetricObservation`, `MetricImportBatch` e `MetricImportRejection`;
- constraints de período, contagem e commit;
- índices para consultas por workspace, métrica, evento e origem;
- chaves estrangeiras para preservar integridade do Core.

### CMD-02 — Query Layer

Status: implementado e integrado à `main`.

- snapshot por `workspaceId` e período;
- agregação de métricas canônicas;
- contagem de eventos;
- último batch de importação;
- todas as queries explicitamente escopadas ao workspace.

### CMD-03 — Authorization Boundary

Status: implementado neste incremento.

- permission key `growth.command_center.read` registrada no catálogo persistente;
- Command Center exige tenant context com workspace explícito;
- `authorize()` roda antes de qualquer query de Growth;
- endpoint `GET /api/command-center` valida sessão persistida, tenant e permissão;
- respostas distinguem autenticação ausente, autorização negada, request inválido e indisponibilidade;
- cache HTTP desabilitado para dados operacionais autenticados;
- testes garantem que nenhuma query execute quando a autorização falha.

### CMD-04 — Operational UI

Status: primeira versão implementada neste incremento.

- rota server-side `/command-center`;
- métricas derivadas somente de observações persistidas;
- contagem de eventos persistidos;
- último batch de importação;
- filtro por período recebido no contexto da página;
- estados de seleção de workspace, autenticação, acesso negado, vazio e indisponibilidade;
- nenhum KPI fictício é usado como fallback.

## Critério de saída

Um usuário autenticado e autorizado deve visualizar exclusivamente os dados do workspace selecionado, dentro do período solicitado, com isolamento end-to-end testado.

## Próximo incremento

- adicionar seletor de workspace derivado das memberships do usuário, removendo a necessidade de IDs manuais na URL;
- adicionar atalhos de período e comparação contra período anterior;
- executar teste de integração PostgreSQL com duas workspaces e memberships distintas;
- fechar o gate de CI antes de promover o incremento.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
