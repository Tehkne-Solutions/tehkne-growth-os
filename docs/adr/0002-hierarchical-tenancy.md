# ADR 0002 — Tenancy hierárquica

- Status: aceito
- Data: 2026-08-02
- Responsável: Tehkné Solutions

## Contexto

Uma operadora pode atender vários clientes, cada cliente pode possuir marcas/unidades e vários workspaces. O modelo anterior de workspace global permitia compartilhamento acidental.

## Decisão

Usar a hierarquia explícita `OperatorOrganization → ClientOrganization → Brand? → Workspace`. Entidades de negócio carregam os IDs de escopo necessários. Consultas recebem `TenantContext`; receber apenas o ID do recurso não basta.

Memberships são escopadas como `OPERATOR`, `CLIENT`, `BRAND` ou `WORKSPACE`. Convites e autenticação serão implementados sem qualquer entrada automática em tenant existente.

## Consequências

- filtros e índices ficam previsíveis;
- testes negativos de vazamento são obrigatórios;
- duplicação controlada de chaves de escopo melhora segurança e rastreabilidade.
