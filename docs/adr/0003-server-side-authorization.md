# ADR 0003 — Autorização no servidor

- Status: aceito
- Data: 2026-08-02
- Responsável: Tehkné Solutions

## Contexto

Ocultar controles na interface não protege recursos. O portal do cliente e a equipe operadora exigem permissões diferentes no mesmo produto.

## Decisão

RBAC será avaliado no servidor a partir de usuário, membership ativa, papel, permissão e escopo solicitado. Server Components fazem leituras internas; Server Actions fazem mutações da interface; Route Handlers ficam reservados a integrações e APIs externas.

Toda negativa relevante e toda mudança de acesso produzem um `AuditEvent` sem segredos.

## Consequências

- componentes clientes nunca são a autoridade de acesso;
- cada caso de uso recebe contexto autorizado imutável;
- a matriz de permissões terá testes positivos e negativos.
