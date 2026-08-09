# INT-88 — Budget Pacing + Performance Anomalies

## Objetivo

Productizar P1.3 do TKN Growth Client Operating System como uma camada observacional e provider-agnostic para:

1. budget pacing;
2. projected spend;
3. desvios de performance;
4. acknowledgement humano.

Princípios:

**Pacing não é recomendação automática de budget.**

**Anomalia não é diagnóstico causal.**

Nenhum cálculo deste incremento altera Google Ads, Meta Ads, CRM ou qualquer outra plataforma.

## Budget Plan

Cada plano registra:
- workspace;
- label;
- início/fim do período;
- budget total;
- moeda;
- threshold de warning;
- threshold critical;
- status ACTIVE/ARCHIVED.

O primeiro release é intencionalmente provider-agnostic. Um snapshot pode ser alimentado por operação humana, scheduler ou integração futura sem mudar a fórmula central.

## Pacing Snapshot

Entrada:
- plano;
- timestamp observado;
- spend acumulado observado;
- referência de origem não secreta.

Cálculos:

`elapsed_ratio = elapsed_time / total_period_time`

`expected_spend = budget * elapsed_ratio`

`projected_spend = actual_spend / elapsed_ratio`

`deviation_pct = (actual_spend - expected_spend) / expected_spend * 100`

O elapsed ratio é limitado a 0–1.

### Estados

- `NOT_STARTED`
- `ON_TRACK`
- `WATCH_UNDER`
- `WATCH_OVER`
- `CRITICAL_UNDER`
- `CRITICAL_OVER`
- `COMPLETE`

Antes do início não existe projected spend.

Durante o período:
- desvio absoluto abaixo do warning → ON_TRACK;
- desvio absoluto >= warning → WATCH_UNDER/OVER;
- desvio absoluto >= critical → CRITICAL_UNDER/OVER.

Depois do fim:
- estado `COMPLETE`;
- o desvio final continua exposto, não escondido.

O AuditEvent de snapshot inclui `externalBudgetMutationExecuted=false`.

## Performance Anomaly

Entrada:
- semantic `metric_id`;
- timestamp observado;
- observed value;
- baseline value;
- thresholds watch/high/critical;
- referência de evidência opcional.

O motor calcula:
- absolute delta;
- direction: BELOW / UNCHANGED / ABOVE;
- deviation percentage quando matematicamente definida;
- severity por magnitude absoluta.

### Severidade

- `UNCLASSIFIED`
- `WATCH`
- `HIGH`
- `CRITICAL`

A direção não determina se o movimento é bom ou ruim. Exemplo: CAC abaixo e Receita abaixo têm implicações diferentes; o motor matemático não presume semântica de negócio.

## Baseline zero

Quando baseline = 0, percentual relativo não é definido de forma útil.

O sistema então registra:
- absolute delta;
- direção;
- `deviation_pct = null`;
- `severity = UNCLASSIFIED`.

Isso evita produzir infinito, falsa precisão ou alerta arbitrário.

## Causalidade

Ao registrar uma anomalia, AuditEvent inclui:
- metric;
- direction;
- severity;
- deviation pct quando disponível;
- `causalClaimMade=false`;
- `externalMutationExecuted=false`.

A anomalia pode alimentar investigação, Growth Action ou Experiment Registry em incrementos posteriores, mas não vira causa automaticamente.

## Segurança

Leitura:
- tenant/workspace explícito;
- `growth.command_center.read`.

Mutação:
- same-origin;
- sessão válida;
- tenant/workspace explícito;
- `growth.actions.manage`.

Referências aceitam somente evidência não secreta. Marcadores típicos de tokens/senhas e strings de alta entropia são rejeitados.

## UI

`/command-center/pacing`

Permite:
- criar plano;
- registrar spend observado;
- ver expected/actual/projected/elapsed/deviation;
- registrar anomalia;
- visualizar ledger por severidade;
- reconhecer uma anomalia para indicar que ela entrou no fluxo humano.

A página não oferece controles de budget/provider.

## Persistência

### `growth_budget_pacing_plans`
Plano de budget/período/thresholds.

### `growth_budget_pacing_observations`
Snapshots derivados e imutáveis.

### `growth_performance_anomalies`
Observações de desvio, severidade, evidência e acknowledgement.

## Não objetivos

INT-88 não:
- altera budget;
- redistribui budget entre canais;
- pausa campanha;
- altera bid;
- cria Growth Action automaticamente;
- diagnostica causa;
- recomenda ação sem contexto;
- substitui Experiment Registry;
- infere provider/source a partir do metric ID.

## Rollout

INT-88 adiciona migration 29.

O schema Production permanece atrás do source enquanto o gate #83 não puder criar o deployment de migration na Vercel. Se P1.3 for integrado, o expected source count passa a **29** e o gate dinâmico deve aplicar todas as migrations pendentes antes de certificar P0/P1 em Production.

## Próximo incremento

P1.4 — Lead Quality taxonomy, ligando volume de mídia a qualidade/estágio comercial sem misturar atribuição com classificação de lead.

Signature: **Tehkné Solutions**
