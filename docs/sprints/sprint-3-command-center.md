# Sprint 3 — Command Center

## Objetivo

Transformar o Growth Data Core já integrado à `main` em uma camada operacional de leitura, com consultas tenant-aware e base pronta para a primeira interface real do Tehkné Growth OS.

## Entregas

### CMD-01 — Migration do Growth Data Core

- migration PostgreSQL para `GrowthEvent`, `MetricObservation`, `MetricImportBatch` e `MetricImportRejection`;
- constraints de período, contagem e commit;
- índices para consultas por workspace, métrica, evento e origem;
- chaves estrangeiras para preservar integridade do Core.

### CMD-02 — Query Layer

- snapshot por `workspaceId` e período;
- agregação de métricas canônicas;
- contagem de eventos;
- último batch de importação;
- todas as queries explicitamente escopadas ao workspace.

### CMD-03 — Authorization Boundary

Status: próximo.

A interface e qualquer endpoint HTTP só podem consumir o snapshot depois de validar sessão + tenant context + autorização de leitura do workspace. Não será exposto endpoint baseado apenas em `workspaceId`.

### CMD-04 — Operational UI

Status: próximo.

Criar a primeira tela do Command Center com KPIs, período, estado vazio, estado de erro e indicação da última importação, usando apenas dados persistidos — sem métricas simuladas.

## Critério de saída

Um usuário autenticado e autorizado deve visualizar exclusivamente os dados do workspace selecionado, dentro do período solicitado, com isolamento end-to-end testado.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
