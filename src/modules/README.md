# Módulos do monólito

| Módulo          | Responsabilidade inicial                               |
| --------------- | ------------------------------------------------------ |
| `identity`      | usuário, sessão, convite e autenticação                |
| `tenancy`       | organizações, marcas, workspaces e contexto autorizado |
| `sectors`       | registry e perfis de Sector Packs                      |
| `clients`       | configuração operacional do cliente                    |
| `journeys`      | jornadas, estágios e conversões                        |
| `metrics`       | definições, fórmulas e qualidade                       |
| `events`        | ingestão, canonicalização e idempotência               |
| `work`          | tarefas, tickets e aprovações                          |
| `crm`           | empresas, contatos e oportunidades                     |
| `integrations`  | conexões, webhooks e sincronização                     |
| `audit`         | trilha imutável de ações críticas                      |
| `ai-governance` | fatos, recomendações, decisões e ações assistidas      |

Regra: um módulo publica contratos por seu `index.ts`; consumidores não importam detalhes internos.
