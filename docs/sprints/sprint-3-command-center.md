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

Status: implementado e integrado à `main`.

- permission key `growth.command_center.read` registrada no catálogo persistente;
- Command Center exige tenant context com workspace explícito;
- `authorize()` roda antes de qualquer query de Growth;
- endpoint `GET /api/command-center` valida sessão persistida, tenant e permissão;
- respostas distinguem autenticação ausente, autorização negada, request inválido e indisponibilidade;
- cache HTTP desabilitado para dados operacionais autenticados;
- testes garantem que nenhuma query execute quando a autorização falha.

### CMD-04 — Operational UI

Status: implementado e integrado à `main`.

- rota server-side `/command-center`;
- métricas derivadas somente de observações persistidas;
- contagem de eventos persistidos;
- último batch de importação;
- seletor de workspace derivado das memberships com permissão de leitura;
- filtro por período;
- estados de seleção, autenticação, acesso negado, vazio e indisponibilidade;
- nenhum KPI fictício é usado como fallback.

### CMD-05 — PostgreSQL Isolation Gate

Status: implementado neste incremento; condicionado ao CI.

- PostgreSQL 16 efêmero como service container do GitHub Actions;
- `prisma migrate deploy` executado antes dos testes;
- teste de integração grava métricas e eventos distintos em dois workspaces reais;
- snapshot do workspace A deve retornar exclusivamente A;
- snapshot do workspace B deve retornar exclusivamente B;
- o gate continua cobrindo Prisma validate/generate, lint, typecheck, testes e build.

## Critério de saída

Um usuário autenticado e autorizado deve visualizar exclusivamente os dados do workspace selecionado, dentro do período solicitado, com isolamento end-to-end comprovado contra PostgreSQL real e gate de CI verde.

## Próxima Sprint

Após o gate do CMD-05 ficar verde, iniciar a Sprint 4 com comparação temporal de KPIs, tendências, metas e evolução do Command Center para uma camada de decisão operacional.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
