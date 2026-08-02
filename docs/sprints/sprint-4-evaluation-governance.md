# Sprint 4 — INT-20 Evaluation UX & Governed Playbook Review

## Objetivo

Fechar o ciclo de aprendizado operacional com avaliação pós-ação feita diretamente no Action Workspace e revisão de playbooks sob governança humana explícita.

## Evaluation UX

Ações `COMPLETED` podem registrar avaliações pós-ação informando:

- métrica;
- moeda opcional;
- janela de baseline;
- janela de avaliação posterior.

A API existente continua responsável por validar workspace, RBAC, versão do Sector Pack, presença da métrica nas duas janelas e semântica de direção.

O resultado volta para a UI imediatamente e atualiza o resumo de efetividade observado.

## Governed Playbook Review

Nova permissão: `growth.playbooks.review`.

Na migração inicial, papéis que já possuem `growth.actions.manage` recebem essa permissão para preservar compatibilidade operacional. A permissão continua separada e pode ser removida desses papéis posteriormente.

Fluxo de proposta:

`DRAFT → SUBMITTED → APPROVED | REJECTED`

Regras:

- rascunho não pode pular diretamente para aprovação/rejeição;
- decisões `APPROVED` e `REJECTED` são terminais;
- o criador não pode aprovar nem rejeitar sua própria proposta;
- criação e transições geram AuditEvent;
- propostas são sempre escopadas por workspace;
- a evidência registrada mantém `causality: not_asserted`;
- aprovação não publica nem altera arquivos de playbook automaticamente.

## Safety / Governance Boundary

O histórico de eficácia é evidência de associação temporal, não prova causal. A governança somente produz uma proposta aprovada para futura publicação versionada. Nenhuma regra em produção é autoeditada e nenhum conector externo é executado por esse fluxo.

## Próximo passo

INT-21 deve transformar propostas `APPROVED` em candidatos versionados de playbook, com diff estruturado, validação de schema, revisão final e publicação humana explícita.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
