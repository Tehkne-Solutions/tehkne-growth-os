# Database boundary

Somente esta pasta pode instanciar e exportar o Prisma Client. Repositórios de domínio devem receber um `TenantContext` autorizado e aplicar o escopo antes de qualquer consulta.
