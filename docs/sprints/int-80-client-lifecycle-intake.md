# INT-80 — Client Lifecycle & Business Intake

## Objetivo

Transformar o primeiro estágio do TKN Growth Client Operating System em uma superfície persistente do Growth OS, sem acoplar o onboarding operacional a mutações de mídia, CRM ou billing.

Fluxo canônico:

`INTAKE → ACCESS_PENDING → AUDIT → TRACKING_REPAIR → STRATEGY_READY → LAUNCHING → LEARNING → OPTIMIZING → SCALING → STABLE_GROWTH`

Estados de exceção e recuperação:

`AT_RISK · PAUSED · OFFBOARDING`

`OFFBOARDING` é terminal neste contrato; reativação futura deverá ser uma operação explicitamente governada, não uma transição implícita.

## Persistência

### `growth_client_profiles`

Um perfil operacional por workspace guarda:
- lifecycle atual;
- objetivo principal de negócio;
- North Star Metric declarada;
- moeda financeira;
- ticket médio;
- budget mensal de mídia;
- ciclo de vendas em dias;
- restrições/capacidade;
- sazonalidade;
- origem/handover;
- autor e último editor.

Editar o intake **não altera o lifecycle**.

### `growth_client_lifecycle_transitions`

Cada mudança de estágio guarda:
- estado anterior;
- estado novo;
- motivo/evidência;
- ator;
- timestamp.

O motivo é obrigatório e cada transição material também gera `AuditEvent` no mesmo transaction boundary.

## Autorização

Leitura:
- tenant/workspace explícito;
- sessão válida;
- `growth.command_center.read`.

Mutação:
- same-origin;
- sessão válida;
- tenant/workspace explícito;
- `growth.actions.manage`.

O incremento reutiliza a autoridade operacional já existente no Action Workspace em vez de introduzir um segundo papel concorrente para o mesmo operador.

## API

`POST /api/growth/client-operations`

Intenções:
- `save_profile`: cria ou atualiza os dados de intake sem tocar no lifecycle;
- `transition`: exige um próximo estado permitido e motivo explícito.

Nenhuma intenção executa campanhas, orçamento, billing, CRM ou mutação externa.

## UI

`/command-center/client-operations`

A página recebe contexto explícito de operadora, cliente e workspace e apresenta:
- lifecycle atual;
- North Star;
- budget;
- origem/handover;
- formulário de intake;
- próximas transições permitidas;
- histórico das últimas transições.

Se a migration ainda não tiver sido aplicada durante uma janela curta de rollout, a superfície falha isoladamente como indisponível; o Command Center e o runtime existente continuam independentes.

## Migration gate

Este incremento introduz a migration seguinte ao baseline produtivo de 23 migrations.

O Production Schema Migration Gate foi endurecido para comparar:

`completedMigrationCount >= quantidade de migration.sql versionadas no repo`

Isso elimina o falso verde antigo em que `schemaReady=true` poderia coexistir com uma migration nova ainda não aplicada.

## Integridade

- não há segredo no intake;
- não há leitura cruzada entre workspaces;
- valores financeiros negativos são rejeitados;
- saltos operacionais incoerentes, como `INTAKE → SCALING`, são recusados;
- `AT_RISK` e `PAUSED` possuem caminhos explícitos de recuperação;
- não há automação de mídia escondida atrás de mudança de lifecycle;
- toda assinatura e material oficial permanecem sob Tehkné Solutions.

## Próximo incremento

P0.2 — productizar o Access/Handover Checklist de #75, ligando Google MCC, Meta partner access, analytics/tracking, CRM, billing owner e cutover ao mesmo workspace sem armazenar credenciais.

Signature: **Tehkné Solutions**
