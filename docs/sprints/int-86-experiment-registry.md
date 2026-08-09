# INT-86 — Growth Experiment Registry

## Objetivo

Productizar P1.1 do TKN Growth Client Operating System como um registro governado de experimentação:

`HIPÓTESE → MÉTRICA → INTERVENÇÃO → JANELA → RESULTADO → DECISÃO → APRENDIZADO`

O sistema registra aprendizado e decisão sem assumir que toda correlação observada é causal.

## Workflow

Estados canônicos:

1. `DRAFT`
2. `READY`
3. `RUNNING`
4. `OBSERVING`
5. `CONCLUDED`
6. `CANCELLED`

Transições principais:
- `DRAFT → READY`
- `READY → RUNNING`
- `RUNNING → OBSERVING`
- `RUNNING/OBSERVING → CONCLUDED`

`CONCLUDED` e `CANCELLED` são terminais.

Um experimento concluído precisa ter:
- `result_summary`;
- `decision`;
- `learning`;
- `concluded_at`.

## Categorias

- Audience
- Offer
- Creative
- Copy
- Landing Page
- Form Friction
- Bidding
- Conversion Signal
- Budget Distribution
- CRM Follow-up
- Retention/Reactivation
- Other

## Design de evidência

O registro distingue:
- `OBSERVATIONAL`
- `BEFORE_AFTER`
- `AB_TEST`
- `HOLDOUT`
- `GEO_EXPERIMENT`
- `OTHER`

Essa classificação **não certifica causalidade**.

Caveats operacionais:
- observacional não é causal;
- before/after não isola efeito da intervenção;
- A/B depende de execução, amostra e análise adequadas;
- holdout depende de comparabilidade/contaminação;
- geo experiment depende do desenho e pareamento regional.

O UI expõe o caveat junto ao experimento.

## Métricas

Cada experimento exige:
- `target_metric_id`;
- `guardrail_metric_id` opcional;
- baseline opcional;
- período de baseline opcional.

Os IDs são semânticos e podem se alinhar aos Metric Goals/Decision Signals existentes sem criar uma FK rígida com uma versão específica de Sector Pack.

## Persistência

`growth_experiments`

Campos principais:
- workspace;
- title/hypothesis;
- category/design;
- target/guardrail metrics;
- baseline;
- intervention;
- status;
- start/observation/conclusion timestamps;
- owner;
- result/decision/learning;
- creator/editor.

## Decisões

- `SCALE`
- `ITERATE`
- `STOP`
- `MAINTAIN`
- `INCONCLUSIVE`
- `CANCELLED`

`CANCELLED` é reservado ao estado cancelado; uma conclusão exige decisão não-cancelled.

## Segurança e governança

Leitura:
- tenant/workspace explícito;
- `growth.command_center.read`.

Mutação:
- same-origin;
- sessão válida;
- tenant/workspace explícito;
- `growth.actions.manage`.

Cada criação/transição gera `AuditEvent`.

## Não objetivos

P1.1 não:
- cria campanhas;
- altera orçamento/lance;
- muda criativos;
- executa split de tráfego;
- encerra experimento automaticamente;
- declara significância estatística;
- converte associação em causalidade;
- cria Growth Action automaticamente.

Essas integrações podem ser construídas depois sobre um registro explícito e auditável.

## UI

`/command-center/experiments`

A superfície permite:
- criar DRAFT;
- registrar hipótese/intervenção;
- escolher categoria e design;
- definir target/guardrail;
- registrar baseline e janela;
- avançar workflow;
- registrar conclusão e learning;
- manter histórico terminal.

## Rollout

INT-86 adiciona migration 27.

Source antes deste incremento possui 26 migrations enquanto Production permanece em 23 devido ao bloqueio #83 (`api-deployments-free-per-day`). Se P1.1 for integrado antes da liberação, o schema esperado passará a 27 e o mesmo gate dinâmico deverá aplicar migrations 24–27 antes de certificar as superfícies Client OS/P1.

## Próximo incremento

P1.2 — Strategy Blueprint + Launch Gate, ligado ao workspace e opcionalmente a Growth Actions/Experiments, sem executar mutação de mídia no primeiro release.

Signature: **Tehkné Solutions**
