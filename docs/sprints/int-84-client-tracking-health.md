# INT-84 — Client Tracking Health

## Objetivo

Productizar P0.3 do TKN Growth Client Operating System como uma camada de evidência de medição separada da saúde dos conectores.

Princípio central:

**provider sync saudável não implica tracking saudável.**

Google Ads, Meta Ads ou HubSpot podem estar autenticados e sincronizando enquanto tags, eventos, deduplicação, consentimento ou conversões continuam incorretos. O Growth OS deve representar essas duas dimensões separadamente.

## Catálogo fixo

O Tracking Health possui nove controles canônicos por workspace:

1. `GA4_COLLECTION`
2. `GTM_CONTAINER`
3. `GOOGLE_ADS_CONVERSION`
4. `META_PIXEL_DATASET`
5. `CAPI_SERVER_SIDE`
6. `EVENT_DEDUPLICATION`
7. `ENHANCED_CONVERSIONS`
8. `CONSENT_PRIVACY`
9. `END_TO_END_SMOKE`

## Estados

- `UNKNOWN` — sem evidência suficiente;
- `PENDING` — avaliação em andamento;
- `HEALTHY` — evidência aplicável validada;
- `DEGRADED` — funciona parcialmente ou com perda conhecida de qualidade;
- `BROKEN` — falha material de medição;
- `NOT_APPLICABLE` — controle explicitamente não aplicável ao cliente.

Ausência de registro começa como `UNKNOWN`; nunca como PASS.

## Agregação fail-closed

A visão consolidada usa precedência explícita:

1. qualquer `BROKEN` → `BROKEN`;
2. sem broken, qualquer `DEGRADED` → `DEGRADED`;
3. todos os controles aplicáveis `HEALTHY` → `HEALTHY`;
4. todos ainda sem evidência → `UNKNOWN`;
5. demais combinações incompletas → `PENDING`.

`NOT_APPLICABLE` não conta como healthy, mas sai do denominador de controles aplicáveis.

## Persistência

`growth_client_tracking_health_items`

Chave composta:
- workspace;
- item canônico.

Campos:
- status;
- referência de evidência não secreta;
- avaliador;
- timestamp de avaliação;
- timestamps de criação/atualização.

O banco restringe `item_key` ao catálogo oficial.

## Evidência

O campo `evidence_reference` serve para identificadores e referências operacionais curtas, por exemplo:
- GA4 Property/Measurement ID;
- GTM Container ID;
- Google conversion action/ID;
- Meta Pixel/Dataset ID;
- referência de evento server-side;
- indicação de `event_id`/dedup smoke;
- conversão com Enhanced Conversions habilitada;
- CMP/Consent Mode validado;
- identificador/timestamp de um lead ou purchase smoke.

A aplicação rejeita marcadores típicos de segredo e strings longas com aparência de token. Tokens, senhas, OAuth secrets e chaves continuam proibidos nessa superfície.

## Autorização

Leitura:
- sessão válida;
- tenant/workspace explícito;
- `growth.command_center.read`.

Mutação:
- same-origin;
- sessão válida;
- tenant/workspace explícito;
- `growth.actions.manage`.

Toda atualização cria `AuditEvent`, mas o audit trail registra somente:
- item;
- status;
- existência ou não de referência;
- `providerSyncImplied=false`.

O valor de evidência não é duplicado no AuditEvent.

## UI

Tracking Health aparece dentro de `/command-center/client-operations` junto de:
- business intake/lifecycle;
- access/handover.

O resumo do workspace passa a mostrar o estado agregado de tracking.

Cada item exibe status, referência não secreta e data da última avaliação.

## Não objetivos

Este incremento não:
- instala GTM;
- cria tags/conversões;
- altera Pixel/CAPI;
- ativa Enhanced Conversions;
- muda CMP/consentimento;
- executa mutação em Google/Meta;
- infere tracking health a partir do scheduler de conectores;
- muda lifecycle automaticamente.

É uma camada de evidência operacional e governança.

## Rollout

INT-84 adiciona a migration seguinte às migrations de P0.1/P0.2.

No momento desta implementação, Production possui 23 migrations e source/main já contém 25; o gate de migration #83 comprovou corretamente `completed=23 / expected=25`, mas não conseguiu criar o deployment autorizado devido à cota Hobby `api-deployments-free-per-day` da Vercel.

Se P0.3 for integrado antes da liberação dessa cota, o source passará a exigir 26 migrations. O gate dinâmico deverá aplicar todas as migrations pendentes e somente certificar Client Operations após `completedMigrationCount >= expected`.

## Próximo incremento

P0.4 — Client Portfolio Overview: visão multi-workspace exception-first para lifecycle, handover, tracking, provider sync, alertas e ações abertas, preservando tenant isolation e autorização.

Signature: **Tehkné Solutions**
