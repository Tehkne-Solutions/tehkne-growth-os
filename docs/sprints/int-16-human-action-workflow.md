# INT-16 — Playbook UI & Human Action Workflow

## Objetivo

Transformar recomendações declarativas em trabalho humano rastreável sem permitir que o Growth OS execute mudanças externas automaticamente.

## Contrato operacional

Fluxo canônico:

`recomendação ativa → OPEN → ACCEPTED → IN_PROGRESS → COMPLETED`

Uma ação também pode seguir para `REJECTED` enquanto estiver aberta, aceita ou em execução. Estados terminais não podem ser reabertos implicitamente.

## Integridade

- toda mutação exige `growth.actions.manage`;
- o workspace vem de um `TenantContext` explícito e autorizado;
- a materialização recalcula a inteligência atual e só aceita uma `recommendationKey` ainda ativa;
- título, rationale, regra e prioridade vêm do playbook versionado do Sector Pack `COMMITTED`, nunca do cliente;
- `(workspace_id, recommendation_key)` é único e torna a materialização idempotente;
- responsável humano é persistido separadamente do autor da materialização;
- transições são registradas em `AuditEvent`;
- nenhuma etapa executa mídia, orçamento, CRM ou outra mutação externa.

## Persistência

`growth_action_items` guarda identidade da recomendação, pack/regra/ação versionados, prioridade, responsável, estado e timestamps de aceite, início, conclusão ou rejeição.

## API

`POST /api/growth/actions`

Intenções suportadas:

- `materialize`: converte uma recomendação ativa em item humano;
- `transition`: movimenta um item por uma transição válida e opcionalmente altera o responsável.

A API aplica same-origin, sessão, tenant e RBAC antes da mutação.

## Próximo incremento visual

- cards de recomendações com “Por quê?”, evidências, regra e checklist;
- botão para materializar recomendação;
- fila humana por status e responsável;
- controles de aceitar, iniciar, concluir e rejeitar;
- leitura do histórico de auditoria no próprio item.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
