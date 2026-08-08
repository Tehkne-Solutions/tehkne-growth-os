# Tehkné Growth OS

Plataforma multiempresa de Growth Operations para aquisição, marketing, dados, CRM, atribuição, governança e automação operacional.

**Produto e propriedade:** Tehkné Solutions

## Estado

O projeto está em **Production Candidate Core 1.0.0-rc.1**. O núcleo de plataforma, Growth Intelligence, Human Decision Loop, governança de playbooks, runtimes de conectores Google Ads/Meta Ads, HubSpot CRM, full-funnel, attribution, scheduler/control plane, observabilidade, vault e hardening de segurança estão implementados e cobertos pelo CI.

A certificação do **Core** é separada da certificação dos providers. Google Ads, Meta Ads e HubSpot permanecem `PENDING_EXTERNAL` até existirem credenciais reais, conta selecionada e first-sync verificado. Nenhum mock ou placeholder promove provider para certificado.

## Capacidades atuais

- tenancy `operadora → cliente → marca → workspace`;
- autenticação, sessões, convites e RBAC hierárquico;
- Sector Packs declarativos e versionados;
- métricas, metas, momentum, signals e playbooks;
- Action Workspace com outcomes, effectiveness e learning;
- revisão, publicação, versionamento e rollback governado de playbooks;
- Google Ads e Meta Ads read-only com OAuth, vault criptografado, sync incremental e freshness;
- HubSpot CRM com leads, opportunities, revenue e associação contact↔deal;
- CPL, CPA, ROAS e métricas full-funnel;
- atribuição privacy-safe com níveis de confiança, revisão humana e campaign revenue;
- scheduler unificado mídia+CRM com locks, retry/backoff e budgets;
- Connector Operations, health, alerts e notificações operacionais;
- production readiness, security audit, Release Capability Matrix e smoke gates de RC/Core.

## Sector Packs

O Core usa packs setoriais para declarar funis, métricas, eventos e regras sem acoplar lógica de cliente ao runtime. Os primeiros packs controlados incluem `growth-services`, `education` e `creative-services`.

## Requisitos

- Node.js `20.19+`, `22.12+` ou `24+`;
- npm 11;
- PostgreSQL 16+.

## Uso local

```bash
cp .env.example .env
npm install
npm run db:validate
npm run db:generate
npm run dev
```

Para criar e aplicar a base local:

```bash
npm run db:migrate
```

## Validação completa

```bash
npm run ci
```

O pipeline executa Prisma validate/generate, audit de dependências de produção, lint, typecheck, testes e build Next.js.

Para validar um ambiente publicado com o gate geral do RC:

```bash
GROWTH_OS_BASE_URL=https://... \
CRON_SECRET=... \
WORKSPACE_ID=... \
npm run smoke:rc
```

Para certificar especificamente o Production Candidate Core:

```bash
GROWTH_OS_BASE_URL=https://tehkne-growth-os.vercel.app \
CRON_SECRET=... \
RC_WORKSPACE_ID=93000000-0000-4000-8000-000000000001 \
EXPECTED_RELEASE_SHA=<main-sha> \
npm run smoke:core-cert
```

O protocolo geral do RC está em `docs/releases/RC-1.md` e a fronteira de certificação do Core em `docs/releases/PRODUCTION-CANDIDATE-CORE-1.0.0-rc.1.md`.

## Estrutura

```text
src/
├── app/                    # rotas e composição da interface
├── modules/                # domínios independentes do monólito
└── shared/                 # infraestrutura e contratos compartilhados
```
