# Sector Packs

Pacotes setoriais versionados do Tehkné Growth OS.

Cada pack descreve o vocabulário de Growth de um setor sem acoplar regras específicas ao Core. O runtime carrega apenas packs publicados e validados.

## Contrato mínimo

Cada diretório de pack deve conter `manifest.json` com:

- `id`: identificador estável em kebab-case;
- `version`: versão semântica;
- `name`: nome humano;
- `status`: `draft`, `active` ou `deprecated`;
- `funnels`: funis e estágios canônicos;
- `metrics`: métricas com unidade e direção desejável;
- `events`: eventos de negócio aceitos pelo pack.

O Core permanece responsável por tenancy, autorização, auditoria e persistência. Packs somente declaram semântica setorial.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
