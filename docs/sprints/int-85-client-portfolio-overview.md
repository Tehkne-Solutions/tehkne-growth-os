# INT-85 — Client Portfolio Overview

## Objetivo

Productizar P0.4 do TKN Growth Client Operating System como uma visão multi-workspace **exception-first**.

A operação de agência não deve exigir abrir cliente por cliente para descobrir problemas. O portfólio organiza somente os workspaces que o usuário já possui autorização para ler e traz primeiro os que exigem decisão humana.

## Sem migration nova

INT-85 é um read model sobre capacidades já persistidas:
- memberships/workspaces autorizados;
- Client Lifecycle / Intake;
- Access/Handover Checklist;
- Tracking Health;
- conectores + checkpoints;
- control-plane alerts;
- Growth Actions abertas/em andamento.

Nenhuma nova tabela é criada.

## Estados de atenção

- `CRITICAL`
- `ACTION_REQUIRED`
- `WATCH`
- `NO_ACTION`

A classificação é determinística e não substitui os componentes originais.

### CRITICAL

Qualquer uma:
- Tracking Health `BROKEN`;
- alerta crítico de conector (`connection_error` ou `repeated_failures`).

### ACTION_REQUIRED

Na ausência de critical:
- lifecycle `AT_RISK`;
- handover bloqueado;
- Tracking Health `DEGRADED`;
- qualquer alerta de conector não crítico;
- Growth Action aberta/aceita/em andamento.

### WATCH

Na ausência das condições anteriores:
- intake/lifecycle ainda inexistente;
- handover incompleto;
- tracking `UNKNOWN`/`PENDING`;
- lifecycle não operacional (`PAUSED`/`OFFBOARDING`).

### NO_ACTION

Somente quando nenhuma exceção determinística acima está ativa.

Isso evita um score opaco: o card sempre expõe os motivos usados para classificação.

## Isolamento

O portfólio começa em `listAuthorizedCommandCenterWorkspaces`, que deriva o universo de workspaces a partir das memberships ativas e de `growth.command_center.read`.

As queries de lifecycle, handover, tracking, connectors e actions ficam restritas à lista de UUIDs autorizados. Alertas globais do control plane são filtrados para o mesmo conjunto antes da agregação.

Um operador nunca ganha acesso adicional por abrir o portfólio.

## Superfície

`/command-center/portfolio?operatorOrganizationId=<uuid>`

A página mostra:
- contagem por estado de atenção;
- cliente/workspace/brand;
- lifecycle;
- handover;
- tracking;
- conectores ativos + alertas;
- última sincronização bem-sucedida;
- ações abertas/em andamento;
- motivos determinísticos;
- links de drill-down para Client Operations, Command Center e Release/Ops.

O Final Operational Console ganha link direto para o portfólio da mesma operadora.

## Limites deliberados

INT-85 não:
- cria ou altera campanhas;
- fecha Growth Actions;
- muda lifecycle;
- altera handover/tracking;
- acessa workspaces sem membership;
- combina métricas em um health score não explicável;
- certifica providers ou tracking pela simples existência de dados.

## Dependência de rollout

O read model depende das tabelas P0.1–P0.3. Source possui 26 migrations, mas Production permanece em 23 até o gate #83 conseguir aplicar as migrations 24–26. Portanto o portfólio deve ser considerado source-ready e Production-unavailable até essa convergência.

## Próximo eixo

Com P0 completo em source, o próximo bloco é P1:
1. Experiment Registry;
2. Strategy Blueprint + Launch Gate;
3. Budget Pacing + Performance Anomalies;
4. Lead Quality taxonomy.

Signature: **Tehkné Solutions**
