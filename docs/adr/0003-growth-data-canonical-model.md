# ADR 0003 — Canonical Growth Data Model

## Status

Accepted

## Context

Dados de mídia, CRM, formulários, planilhas e integrações possuem formatos incompatíveis. O Command Center não deve depender diretamente do schema de cada origem.

## Decision

Normalizar entradas em dois contratos centrais:

1. `GrowthEvent` para fatos discretos de negócio;
2. `MetricObservation` para valores medidos em um período.

Toda entrada é escopada por `workspaceId`. Eventos carregam `sectorPackId` e `sectorPackVersion`; métricas usam IDs declarados pelo pack ativo. Importações de arquivo recebem fingerprint SHA-256 escopado por workspace e versão do pack.

Integrações futuras devem adaptar seus payloads para esses contratos antes da persistência. O schema específico do provedor não atravessa a fronteira do adapter.

## Consequences

- o Command Center consulta um modelo estável;
- troca ou adição de provedores não exige reescrever dashboards;
- idempotência e auditoria podem ser aplicadas de forma uniforme;
- dados inválidos são rejeitados antes de entrar no modelo analítico.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
