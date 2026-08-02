# Sprint 4 — Metric Goals Management

## Objetivo

Fechar o ciclo de metas do Growth Intelligence com um único modelo persistente, autorização própria e trilha de auditoria.

## INT-07 — Prisma MetricGoal

Status: implementado.

- `metric_goals` espelhado no schema Prisma;
- relação `Workspace.metricGoals`;
- leitura de metas migrada do SQL bruto para Prisma;
- período efetivo continua protegido pela migration existente.

## INT-08 — Goal Management Permission

Status: implementado.

- nova permissão `growth.goals.manage`;
- toda mutação exige workspace explícito e membership autorizada;
- consultas ao Growth Core só acontecem depois da autorização.

## INT-09 — Goal Mutation Service

Status: implementado.

- usa somente o último Sector Pack `COMMITTED` do workspace;
- rejeita métricas não declaradas pelo pack;
- normaliza moeda ISO de três letras;
- fecha a meta aberta anterior antes de criar a nova versão;
- grava meta e `AuditEvent` na mesma transação.

## INT-10 — Goal API

Status: primeira versão implementada.

- `POST /api/growth/goals`;
- sessão segura por cookie HttpOnly;
- validação de mesma origem;
- tenant explícito;
- respostas 400/401/403/503 sem expor detalhes internos.

## Próximo incremento

- UI de criação/edição de metas dentro do Command Center;
- listagem de histórico de metas;
- sinais priorizados combinando outcome semântico, target status e tendência;
- séries temporais multi-período.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
