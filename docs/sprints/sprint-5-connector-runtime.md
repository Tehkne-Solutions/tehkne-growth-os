# Sprint 5 — INT-23 Connector Runtime & Data Freshness

## Objetivo

Introduzir a fundação comum para conectores reais de Growth sem acoplar o Core ao schema ou às credenciais de cada provedor.

## Escopo atual

- providers iniciais: `META_ADS` e `GOOGLE_ADS`;
- modo obrigatório: `read-only`;
- conexão lógica escopada por workspace;
- referência externa de segredo (`secret_ref`) sem token bruto em tabelas de domínio;
- checkpoint incremental por cursor e watermark;
- sync runs auditáveis com contadores;
- deduplicação SHA-256 escopada por workspace + provider + conta + external id;
- freshness/health com estados `fresh`, `aging`, `stale`, `unavailable`;
- health snapshots tenant-aware.

## SLO inicial

- `fresh`: último sync bem-sucedido em até 180 minutos;
- `aging`: acima de 180 e abaixo de 720 minutos;
- `stale`: 720 minutos ou mais;
- três falhas consecutivas forçam estado `stale` mesmo dentro da janela temporal;
- conexões pausadas, desconectadas ou sem sync bem-sucedido ficam `unavailable`.

## Segurança

Nenhum access token, refresh token, client secret ou credencial OAuth é persistido nas tabelas de domínio. A coluna `secret_ref` é somente um identificador opaco para um secret provider futuro.

## Próximos incrementos

1. secret provider e OAuth provider-specific;
2. adapters Meta Ads e Google Ads;
3. normalização provider payload → `MetricObservation` / `GrowthEvent`;
4. scheduler/queue para sync incremental;
5. diagnostics UI e freshness no Command Center;
6. retry/backoff e rate-limit budgets.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
