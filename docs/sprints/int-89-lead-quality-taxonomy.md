# INT-89 — Lead Quality Taxonomy

## Objetivo

Productizar P1.4 do TKN Growth Client Operating System para conectar volume de aquisição a qualidade comercial sem:

- armazenar PII no identificador operacional do lead;
- tratar referência de campanha como atribuição;
- sobrescrever o histórico de qualificação;
- confundir qualidade com causalidade.

## Modelo append-only

Cada mudança de qualidade cria uma nova observação.

O estado corrente é calculado pelo **último evento de cada lead_reference**. Eventos anteriores continuam preservados para auditoria e evolução temporal.

## Taxonomia

Classes canônicas:

1. `UNREVIEWED`
2. `INVALID`
3. `UNQUALIFIED`
4. `QUALIFIED`
5. `HIGH_QUALITY`
6. `CONVERTED`

A taxonomia é deliberadamente genérica para funcionar em diferentes verticais sem impor MQL/SQL/opportunity como linguagem obrigatória.

### Reasons

- `SPAM`
- `DUPLICATE`
- `OUTSIDE_GEO`
- `OUTSIDE_PROFILE`
- `NO_INTENT`
- `LOW_INTENT`
- `VALID_FIT`
- `HIGH_INTENT`
- `SALES_ACCEPTED`
- `PURCHASED`
- `OTHER`

O domínio restringe reasons incompatíveis com a classe. `UNREVIEWED` não aceita reason.

## Source dimension

Dimensões disponíveis:
- GOOGLE_ADS
- META_ADS
- HUBSPOT
- ORGANIC
- DIRECT
- REFERRAL
- OTHER

Pode existir `campaign_reference` opcional.

Esses campos servem para **segmentação operacional**. O sistema não os interpreta como prova de atribuição.

AuditEvent registra explicitamente:

`attributionClaimMade=false`

## Privacidade

`lead_reference` deve ser um identificador opaco, como:
- CRM/contact ID;
- internal lead ID;
- UUID/ID técnico sem dado pessoal legível.

O formato aceito é limitado a letras, números, `:`, `_` e `-`.

Isso bloqueia formatos naturais de:
- e-mail;
- telefone formatado;
- nome completo;
- texto livre.

`campaign_reference` segue o mesmo princípio.

A API não precisa receber nome, e-mail ou telefone para operar a taxonomia.

AuditEvent não duplica lead_reference e registra:
- quality class;
- reason;
- source dimension;
- presença/ausência de campaign ref;
- `piiStoredInLeadReference=false`;
- `attributionClaimMade=false`;
- `externalMutationExecuted=false`.

## Métricas de qualidade

O read model usa somente o estado mais recente por lead.

### Reviewed denominator

Rates usam somente leads com classe diferente de `UNREVIEWED`.

### Qualified

`QUALIFIED + HIGH_QUALITY + CONVERTED`

### High Quality

`HIGH_QUALITY + CONVERTED`

### Converted

Somente `CONVERTED`.

### Rates

- qualification rate;
- high-quality rate;
- conversion rate;
- invalid rate.

Quando não há leads revisados, rates são `null`, não zero artificial.

## Segmentação

O mesmo resumo é calculado por:

`source_channel + campaign_reference`

Isso permite responder perguntas como:
- qual origem está trazendo mais leads qualificados?
- qual campanha reference concentra invalid/unqualified?
- onde existe volume sem qualidade?

Sem declarar que a origem/campanha foi causalmente responsável pela conversão.

## Segurança

Leitura:
- tenant/workspace explícito;
- `growth.command_center.read`.

Mutação:
- same-origin;
- sessão válida;
- tenant/workspace explícito;
- `growth.actions.manage`.

Evidence references continuam com as mesmas proteções contra material secreto/high-entropy usadas no Client OS.

## UI

`/command-center/lead-quality`

Mostra:
- reviewed/total;
- qualification rate;
- high-quality rate;
- conversion rate;
- invalid rate;
- quality mix;
- segmentos por source/campaign reference;
- estado corrente de cada lead opaque reference;
- formulário append-only de nova observação.

## Persistência

`growth_lead_quality_observations`

Campos principais:
- workspace;
- opaque lead reference;
- source dimension;
- campaign reference opcional;
- quality class;
- reason;
- observed at;
- evidence reference;
- actor/timestamp.

## Não objetivos

INT-89 não:
- armazena nome/e-mail/telefone;
- substitui CRM;
- altera lead no HubSpot;
- muda campanha;
- move budget;
- cria attribution credit;
- decide automaticamente se um canal deve ser pausado;
- cria Growth Action automaticamente.

## Rollout

INT-89 adiciona migration 30.

Se P1.4 for integrado, source passa a 30 migrations. Production só certifica P0/P1 após o gate #83 provar o expected source migration count no banco real.

## Próximo eixo

Com P1 completo, o próximo bloco recomendado é P2 operacional:
- creative intelligence / fatigue evidence;
- recurring operating cadence;
- client health / agency capacity;
- automatizações assistidas sobre Growth Actions, sempre com approval/evidence gates.

Signature: **Tehkné Solutions**
