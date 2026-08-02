# Integration tests

Os testes de integração usam o PostgreSQL efêmero do GitHub Actions após `prisma migrate deploy`.

## Command Center isolation

`command-center-postgres-isolation.test.ts` cria uma operadora, um cliente e dois workspaces reais no banco. Cada workspace recebe métricas e eventos com valores deliberadamente diferentes. O teste consulta o Command Center para cada workspace e comprova que nenhuma observação ou evento do outro tenant atravessa a query layer.

Os fixtures são removidos ao final da suíte.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
