# Tehkné Growth OS

Plataforma multiempresa de Growth Operations para aquisição, marketing, dados e automação em clientes de diferentes setores.

**Produto e propriedade:** Tehkné Solutions

## Estado

Sprint 1 — Foundation. Este incremento cobre:

- `FND-01`: repositório local preparado em `main`; criação do remoto privado pendente;
- `FND-02`: scaffold Next.js App Router e monólito modular;
- `FND-03`: TypeScript estrito, lint, testes, formatação, build e CI;
- `FND-04`: schema `operadora → cliente → marca → workspace` e auditoria;
- `FND-05`: credenciais seguras e autenticação server-side;
- `FND-06`: sessões persistidas, expiradas e revogáveis;
- `FND-07`: convites de uso único, escopados e transacionais;
- `FND-08`: RBAC hierárquico, auditoria de negações e bloqueio de escalada por papel.

Ainda não existem conexões com contas reais, campanhas, métricas de clientes ou automações financeiras.

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

O pipeline executa validação e geração do Prisma Client, lint, typecheck, testes e build.

## Estrutura

```text
src/
├── app/                    # rotas e composição da interface
├── modules/                # domínios independentes do monólito
└── shared/                 # infraestrutura e contratos compartilhados
prisma/                     # schema e migrações PostgreSQL
sector-packs/               # pacotes setoriais versionados
tests/                      # testes unitários, de arquitetura, tenancy e integração
docs/adr/                   # decisões arquiteturais
```

## Princípios de segurança

- nenhuma pessoa entra automaticamente em um workspace existente;
- todo acesso de negócio começa por um contexto de tenant autorizado;
- IDs de recurso isolados não são considerados autorização;
- segredos nunca são armazenados em tabelas de domínio ou logs;
- alterações críticas geram auditoria;
- conectores de mídia paga permanecem somente leitura no MVP.

## Contrato de identidade

- `POST /api/auth/login`: autentica e cria cookie `HttpOnly`, `SameSite=Strict`;
- `POST /api/auth/logout`: revoga a sessão atual e remove o cookie;
- `GET /api/auth/session`: valida a sessão sem expor credenciais;
- `POST /api/invitations`: exige sessão, tenant e permissão de convite;
- `POST /api/invitations/accept`: consome o convite e ativa a membership.

Os endpoints de mutação validam a origem. O token bruto de sessão ou convite nunca é persistido; somente seu HMAC é armazenado.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
