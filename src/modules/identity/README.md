# Identity

Usuários, credenciais, autenticação, sessões revogáveis, convites de uso único e autorização RBAC hierárquica.

## Garantias

- senhas derivadas com `scrypt`; hashes nunca saem do módulo;
- tokens opacos de 256 bits, persistidos somente como HMAC SHA-256;
- sessão revogável individualmente ou por usuário;
- convite transacional, expirável e consumido uma única vez;
- conta existente só aceita novo acesso quando já autenticada;
- permissões são resolvidas no servidor sobre memberships ativas que cobrem o tenant;
- negações retornam mensagens genéricas e não revelam a existência da conta.
