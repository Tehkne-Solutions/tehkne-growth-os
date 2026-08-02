# Sprint 4 — INT-21 Governed Playbook Publishing

## Objetivo

Transformar propostas `APPROVED` em versões publicáveis de regras sem permitir autoedição, autopublicação ou impacto global acidental.

## Fluxo

`APPROVED proposal → DRAFT candidate → VALIDATED → PUBLISHED | REJECTED`

Regras de governança:

- somente proposta `APPROVED` pode gerar candidato;
- candidato preserva `sectorPack`, regra e base versionada da proposta;
- a regra candidata passa novamente pelo schema declarativo;
- a versão candidata deve ser semanticamente maior que a versão base;
- o candidato é imutável: validação/publicação alteram somente estado e metadados;
- `DRAFT` não pode ser publicado diretamente;
- o criador do candidato não pode publicá-lo;
- publicação e validação exigem `growth.playbooks.publish`;
- toda criação/transição gera `AuditEvent`;
- publicação é escopada por workspace;
- playbook canônico em `sector-packs/*/playbooks.json` permanece fallback imutável.

## Diff estruturado

O candidato persiste diferenças em `version`, `name`, `status`, `priority`, `when` e `action`. O diff registra `before` e `after` para revisão humana e auditoria.

## Runtime

O loader parte sempre do playbook canônico versionado. Quando recebe `database + workspaceId`, aplica somente candidatos `PUBLISHED` daquele workspace e do mesmo Sector Pack/versionamento. Publicações de outro workspace nunca entram na resolução.

Isso permite rollout controlado sem transformar uma evidência observada em um novo comportamento global para todos os clientes.

## Boundary

Publicar um playbook não executa mídia, orçamento, CRM ou qualquer conector externo. A publicação muda apenas a regra declarativa usada para gerar futuras recomendações no workspace autorizado.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
