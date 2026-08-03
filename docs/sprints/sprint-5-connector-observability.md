# Sprint 5 — INT-30 Connector Alerts & Operations Observability

## Objetivo

Tornar o control plane de conectores observável dentro do produto sem expor credenciais ou dados de outros workspaces.

## Entregas

- Pulse do scheduler com estado `healthy`, `degraded` ou `unknown`.
- Histórico recente do control plane exibindo apenas trigger, status, horário, duração e budget.
- Alertas do control plane filtrados pelo workspace autorizado.
- Política inicial de candidatos de notificação:
  - `connection_error` e `repeated_failures` => `critical`.
  - `never_synchronized` e `stale_data` => `warning`.
- Cards de contas que exigem revisão humana.
- Integração com a UI existente de Connector Operations.

## Isolamento

Alertas e candidatos de notificação são filtrados por `workspaceId`. O pulse do scheduler é tratado como saúde de infraestrutura e não expõe IDs de outros tenants, nomes de contas ou métricas de outros workspaces.

## Limite deliberado

INT-30 não envia e-mail, Slack ou webhook. Ele apenas produz candidatos de notificação determinísticos. A entrega multicanal deve ser adicionada em um incremento separado com preferências, deduplicação e rate limiting próprios.
