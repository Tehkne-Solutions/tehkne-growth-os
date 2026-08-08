# INT-82 — Client Access & Handover Checklist

## Objetivo

Productizar o SOP de transição Unti → Hands Up / TKN Growth (#75) dentro do mesmo workspace do Client Operations, sem armazenar senhas, tokens ou segredos de providers.

## Princípio

**Ativos continuam pertencendo ao cliente.**

O Growth OS registra o estado da delegação/acesso e referências não secretas. Ele não exige transferência de propriedade nem compartilhamento de senha.

## Catálogo fixo

A matriz possui 13 itens canônicos:

1. Google Ads / MCC
2. Meta partner access
3. GA4
4. GTM
5. Website / CMS
6. Landing pages
7. HubSpot / CRM
8. Meta Pixel / Dataset
9. Conversions API / server-side
10. Domain ownership
11. Billing owner
12. End-to-end tracking smoke
13. Handover cutover

Clientes que não usam uma capacidade devem marcá-la explicitamente como `NOT_APPLICABLE`; ausência de evidência nunca vira PASS automaticamente.

## Status

- `PENDING`
- `IN_PROGRESS`
- `VERIFIED`
- `BLOCKED`
- `NOT_APPLICABLE`

O handover só é `complete` quando todos os 13 itens estão `VERIFIED` ou `NOT_APPLICABLE`, sem item pendente/em andamento/bloqueado.

## Persistência

`growth_client_handover_items`

Chave composta:
- workspace;
- item canônico.

Campos de evidência:
- status;
- referência externa não secreta;
- usuário verificador;
- timestamp da verificação;
- último editor.

O banco possui CHECK do catálogo fixo e consistência de `VERIFIED` com ator/timestamp.

## Referências aceitas

Exemplos esperados:
- Google Customer/MCC ID;
- Meta Business ID / `act_...`;
- GA4 Property/Measurement ID;
- GTM Container ID;
- HubSpot Portal ID;
- Pixel/Dataset ID;
- domínio;
- rótulo de responsabilidade de billing;
- timestamp/referência de cutover.

A aplicação rejeita entradas com marcadores típicos de material secreto e referências longas com alta aparência de token. Isso é defense-in-depth; a política operacional continua sendo **nunca colar credenciais nesta matriz**.

## Autorização

Leitura:
- `growth.command_center.read` no tenant/workspace explícito.

Mutação:
- sessão válida;
- same-origin;
- `growth.actions.manage`;
- workspace explícito.

Cada atualização cria `AuditEvent` com item/status e apenas o booleano `hasExternalReference`; o valor da referência não é duplicado no audit trail.

## UI

A matriz aparece dentro de `/command-center/client-operations` junto ao intake/lifecycle.

O Final Operational Console ganha um link direto para `Client Operations` preservando o contexto de tenant/workspace.

## Não objetivos deste incremento

Este incremento não:
- conecta Google/Meta/HubSpot;
- lê ou grava provider secrets;
- altera billing;
- transfere ativos;
- muda lifecycle automaticamente;
- remove acesso da Unti;
- decide cutover pelo operador.

O handover continua uma decisão humana com evidência estruturada.

## Rollout

P0.2 adiciona a migration seguinte a P0.1. O Production Schema Migration Gate do P0.1 já calcula dinamicamente a quantidade versionada de migrations, portanto um rollout acumulado consegue exigir todas as migrations pendentes antes de certificar Client Operations.

## Próximo incremento

P0.3 — Tracking Health: evidência estruturada de GA4/GTM/conversões Google/Meta/CAPI/deduplicação/Enhanced Conversions/consentimento e último smoke end-to-end, separada da saúde de conectores.

Signature: **Tehkné Solutions**
