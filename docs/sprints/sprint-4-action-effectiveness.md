# Sprint 4 — INT-18 Action Outcome & Effectiveness

## Objetivo

Medir o que aconteceu depois de uma ação humana concluída sem afirmar causalidade automaticamente.

## Contrato

- somente ações `COMPLETED` podem ser avaliadas;
- a métrica deve existir no Sector Pack versionado da ação;
- baseline e janela de avaliação são explícitos e não podem se sobrepor;
- ambas as janelas são consultadas somente no workspace autorizado;
- a direção semântica (`up`, `down`, `contextual`) vem do Sector Pack;
- cada avaliação persiste baseline, valor posterior, delta absoluto, delta percentual e outcome;
- avaliações são idempotentes por ação + métrica + moeda;
- cada gravação produz `AuditEvent`;
- metadados de auditoria registram `causality: not_asserted`.

## Outcomes

- `IMPROVED`
- `WORSENED`
- `NEUTRAL`
- `CONTEXT_REQUIRED`
- `INSUFFICIENT_DATA`

## Effectiveness summary

O resumo de eficácia conta todos os outcomes, mas a taxa de melhoria usa apenas resultados julgáveis (`IMPROVED`, `WORSENED`, `NEUTRAL`). Métricas contextuais ou sem dados suficientes não entram no denominador.

## Safety boundary

Uma melhoria posterior à ação não prova que a ação causou a melhoria. O Growth OS apresenta associação temporal e evidência mensurável; causalidade exige desenho experimental ou evidência adicional.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
