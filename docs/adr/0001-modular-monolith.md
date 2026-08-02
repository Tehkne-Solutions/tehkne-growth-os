# ADR 0001 — Monólito modular

- Status: aceito
- Data: 2026-08-02
- Responsável: Tehkné Solutions

## Contexto

O produto precisa entregar múltiplos domínios de Growth Operations com uma equipe inicial enxuta. Microsserviços antecipariam custo de operação, observabilidade e consistência distribuída sem benefício comprovado.

## Decisão

Adotar Next.js e PostgreSQL em um monólito modular. Cada módulo possui domínio, aplicação e infraestrutura próprios; módulos não acessam tabelas de outro domínio diretamente. Integrações assíncronas usam contratos e, futuramente, outbox.

## Consequências

- implantação e transações permanecem simples;
- limites são verificados por testes de arquitetura;
- um módulo poderá ser extraído somente quando carga, segurança ou equipe justificarem.
