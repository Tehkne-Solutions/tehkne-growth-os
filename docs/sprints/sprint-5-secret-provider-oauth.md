# Sprint 5 — INT-24 Secret Provider & OAuth Foundation

## Objetivo

Preparar OAuth seguro para conectores de Growth sem persistir access token, refresh token, client secret, state OAuth ou PKCE verifier em texto puro nas tabelas de domínio.

## Secret Provider

O primeiro provider é um vault de infraestrutura no PostgreSQL com AES-256-GCM.

- a master key não é persistida no banco;
- `CONNECTOR_SECRET_MASTER_KEY` deve ser fornecida pelo ambiente como Base64 de exatamente 32 bytes;
- o banco armazena somente ciphertext, IV, authentication tag e versão da chave;
- `secret_ref` continua sendo a única informação disponível nas tabelas de conexão;
- rotação de um segredo sobrescreve o ciphertext e incrementa `key_version`;
- nenhum payload secreto pode ser escrito em logs ou AuditEvent.

## OAuth

O fluxo usa Authorization Code + PKCE S256.

1. usuário autorizado inicia conexão;
2. `growth.connectors.manage` é validada no workspace;
3. state aleatório de 256 bits é entregue ao browser;
4. somente SHA-256 do state é persistido;
5. code verifier fica criptografado no vault por uma referência temporária;
6. callback consome o state atomicamente e uma única vez;
7. tentativas expiram por padrão em 10 minutos;
8. o material PKCE é apagado do vault após consumo.

## Provedores

### Google Ads

- OAuth 2.0 de usuário;
- escopo `https://www.googleapis.com/auth/adwords`;
- acesso offline preparado para refresh token;
- chamadas reais também exigirão Google Ads developer token.

### Meta Ads

- escopo inicial `ads_read`;
- a versão da Graph API é obrigatória e deve ser informada explicitamente pela configuração de deployment;
- nenhuma versão é congelada como default no código.

## Fora do escopo deste incremento

- troca real do authorization code por tokens;
- descoberta/listagem de contas externas;
- gravação do token bundle final em `secret_ref` da conexão;
- refresh automático;
- chamadas à Marketing API ou Google Ads API;
- scheduler e retries.

Esses passos entram nos adapters provider-specific depois que a fundação de segredo/OAuth passar pelo gate completo.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
