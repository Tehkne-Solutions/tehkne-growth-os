# ADR 0002 — Sector Pack Registry

## Status

Accepted

## Context

O Tehkné Growth OS atende organizações de setores diferentes. Métricas, funis e eventos precisam variar por contexto sem transformar o Core em um conjunto de condicionais por cliente.

## Decision

Adotar Sector Packs declarativos e versionados. Cada pack publica um manifesto com funis, métricas e eventos. O Core valida o contrato e resolve a versão ativa por identificador.

Packs não podem conceder autorização, acessar segredos, alterar tenancy ou executar integrações diretamente.

Os três primeiros packs controlados são:

- `growth-services` — operação institucional da Tehkné Solutions;
- `education` — validação educacional com SimpleWay Academy;
- `creative-services` — validação de serviços/projetos com MAV.

## Consequences

- novos setores podem ser adicionados sem alterar domínios centrais;
- dashboards e importadores podem trabalhar com IDs canônicos;
- mudanças semânticas passam a ter versão explícita;
- validação de schema se torna uma barreira obrigatória antes da publicação.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
