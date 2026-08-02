# Sprint 5 — INT-25 Google Ads OAuth & Provider Adapter

## Objetivo

Completar o primeiro fluxo real de conexão read-only sobre a fundação segura do INT-24.

## Fluxo

`OAuth callback → state/user validation → authorization code exchange → encrypted pending token bundle → accessible accounts discovery → explicit account selection → read-only verification → connector activation`

## Segurança

- o callback é vinculado ao mesmo usuário que iniciou o OAuth;
- state continua armazenado somente como SHA-256 e é consumido uma única vez;
- PKCE verifier é removido do vault após o consumo;
- access/refresh tokens são armazenados somente no secret provider criptografado;
- a resposta pública de discovery contém apenas IDs e nomes de contas, nunca tokens;
- seleção de conta é explícita; nenhuma conta é ativada automaticamente;
- reconexão reutiliza o secret_ref existente para não deixar token bundles órfãos;
- Google Ads API version e developer token são configuração explícita.

## Google Ads

O primeiro request read-only usa `customers:listAccessibleCustomers`. A versão da API não é hardcoded pelo domínio; deployment/configuração deve fornecer a versão aprovada. O developer token permanece no secret provider e é enviado somente no header requerido pela API.

## Fora deste incremento

- Meta Ads token exchange e account discovery;
- refresh automático de access token;
- scheduler de sincronização;
- normalização de campanhas para MetricObservation;
- UI de account selection.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
