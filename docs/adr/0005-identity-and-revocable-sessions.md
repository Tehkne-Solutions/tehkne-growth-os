# ADR 0005 — Identidade, sessões revogáveis e convites

- Status: aceito
- Data: 2026-08-02
- Responsável: Tehkné Solutions

## Contexto

O Growth OS opera múltiplas organizações, clientes, marcas e workspaces. Um token autoportante sem estado dificultaria revogação imediata, encerramento global de sessões e resposta a incidentes. Convites também não podem criar acesso implícito a um workspace global ou permitir escalada de privilégios.

## Decisão

- credenciais locais usam `scrypt` com salt aleatório e comparação em tempo constante;
- tokens de sessão e convite possuem 256 bits aleatórios;
- somente HMAC SHA-256 com separação por finalidade é persistido;
- sessões possuem validade, último uso e revogação individual ou por usuário;
- cookies são `HttpOnly`, `SameSite=Strict`, `Path=/` e `Secure` em produção;
- convites expiram, são consumidos uma única vez e carregam papel e escopo completos;
- aceitação de convite cria ou ativa membership na mesma transação;
- conta preexistente precisa estar autenticada para receber um novo acesso;
- o emissor só concede papéis cujas permissões já possui, salvo `identity.roles.assign_any`;
- negações de autorização e mudanças de convite geram auditoria sem tokens ou senhas.

## Consequências

- o banco é consultado para validar sessões e possibilita revogação imediata;
- vazamento do banco não revela tokens ativos em texto puro;
- o envio de convites dependerá de um provedor transacional posterior;
- recuperação de senha, MFA e provedores OIDC entram em incrementos próprios sem mudar o contrato de sessão.
