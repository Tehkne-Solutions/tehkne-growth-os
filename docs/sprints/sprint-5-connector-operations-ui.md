# INT-28 — Connector Operations UI & Manual Sync

## Objetivo

Tornar visível e operável, por workspace, o runtime read-only de conectores criado nos incrementos INT-23 a INT-27.

## Entrega

- rota `/command-center/connectors` protegida por sessão + tenant explícito + `growth.connectors.manage`;
- cards por conexão com provider, conta externa, status, freshness, watermark, último sucesso, última tentativa e falhas consecutivas;
- histórico recente de sync runs com lidos, gravados, deduplicados e erro;
- `POST /api/growth/connectors/sync` protegido por same-origin + sessão + RBAC;
- sincronização manual reutiliza `planPaidMediaSyncWindow`, retry/backoff, `syncPaidMediaPerformance`, Sector Pack COMMITTED e persistência idempotente por `source_key`;
- credenciais continuam restritas ao vault criptografado e não são serializadas para o browser;
- Google Ads e Meta Ads permanecem read-only.

## Configuração de runtime

A sincronização manual exige:

- `CONNECTOR_SECRET_MASTER_KEY`;
- Google Ads: `GOOGLE_ADS_API_VERSION` e `GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF`;
- Meta Ads: `META_GRAPH_API_VERSION`.

Ausência da configuração retorna indisponibilidade operacional sem expor segredos.

## Não objetivos

- editar campanhas, orçamento ou anúncios;
- expor access/refresh token;
- executar sincronização sem workspace autorizado;
- criar um pipeline diferente do scheduler automático.

## Gate

PostgreSQL + Prisma validate/generate + migrations + lint + typecheck + tests + Next.js build.
