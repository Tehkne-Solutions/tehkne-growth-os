# Tehkné Growth OS

Plataforma multiempresa de Growth Operations para aquisição, marketing, dados, CRM, atribuição, governança e automação operacional.

**Produto e propriedade:** Tehkné Solutions

## Estado

O projeto está em **Release Candidate 1 (INT-41)**. O Core, Growth Intelligence, Human Decision Loop, governança de playbooks, conectores Google Ads/Meta Ads, HubSpot CRM, full-funnel, attribution, scheduler/control plane, observabilidade e hardening de segurança já estão implementados e cobertos pelo CI.

A validação final de produção exige deployment publicado, first-sync real dos conectores configurados, smoke do ambiente, execução do scheduler e evidência do golden path completo.

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
- production readiness, security audit e Release Candidate smoke gate.

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

Para validar um ambiente publicado:

```bash
GROWTH_OS_BASE_URL=https://... \
CRON_SECRET=... \
WORKSPACE_ID=... \
npm run smoke:rc
```

O protocolo completo do RC está em `docs/releases/RC-1.md`.

## Estrutura

```text
src/
├── app/                    # rotas e composição da interface
├── modules/                # domínios independentes do monólito
└── shared/                 # infraestrutura e contratos compartilhados
prisma/                     # schema e migrações PostgreSQL
sector-packs/               # pacotes setoriais versionados
tests/                      # testes unitários, arquitetura, tenancy e integração
docs/                       # ADRs, operação e releases
```

## Princípios de segurança

- nenhuma pessoa entra automaticamente em um workspace existente;
- todo acesso de negócio começa por contexto de tenant autorizado;
- IDs de recurso isolados não são autorização;
- segredos nunca são persistidos em tabelas de domínio ou logs;
- tokens de providers ficam somente no vault criptografado/secret providers;
- alterações críticas geram auditoria;
- conectores de mídia permanecem read-only;
- atribuição não presume causalidade sem evidência explícita;
- high/critical production dependency findings bloqueiam release.

## Release Candidate

O RC-1 só recebe **GO** quando CI, security audit, first-sync, scheduler, production readiness, segurança HTTP e golden path real estiverem comprovados. O workflow manual `Release Candidate Deploy` automatiza o deploy Vercel e executa `smoke:rc` contra a URL criada.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
