# ADR 0004 — Dados e integrações

- Status: aceito
- Data: 2026-08-02
- Responsável: Tehkné Solutions

## Contexto

Ads, analytics, CRM, LMS e sites produzem dados com semânticas, atrasos e níveis de confiança diferentes. Credenciais e PII elevam o risco operacional.

## Decisão

PostgreSQL é a fonte de verdade operacional. Eventos preservam origem, horário e idempotência. PII é separada de analytics quando possível. Credenciais serão referenciadas por secret manager e nunca persistidas como JSON legível em entidades de domínio.

Conectores de Ads são somente leitura no MVP. Escritas futuras exigirão simulação, aprovação, limite financeiro, cooldown, auditoria e desligamento de emergência.

## Consequências

- `conflicted` e `unavailable` bloqueiam recomendações críticas;
- webhooks e jobs precisarão de outbox e deduplicação;
- integrações WordPress permanecem produtos separados conectados por API/eventos.
