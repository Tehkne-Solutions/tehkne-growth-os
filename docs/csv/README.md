# CSV Import Contract

O importador de métricas recebe CSV UTF-8 com cabeçalho canônico.

## Campos

| Campo | Obrigatório | Descrição |
| --- | --- | --- |
| `metric_id` | sim | ID declarado pelo Sector Pack ativo |
| `period_start` | sim | início do período em formato aceito pelo runtime |
| `period_end` | sim | fim do período; não pode anteceder o início |
| `value` | sim | valor numérico |
| `source` | não | origem; padrão `csv` |
| `currency` | não | código monetário quando aplicável, por exemplo `BRL` |

## Pipeline

`arquivo → fingerprint → parse → preview → validação contra Sector Pack → persistência transacional → auditoria`

O preview separa linhas aceitas e rejeitadas antes da persistência. O fingerprint considera workspace, pack, versão e conteúdo normalizado para impedir que o mesmo arquivo seja aplicado duas vezes ao mesmo contexto.

O próximo incremento adiciona o batch persistente e replay idempotente.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
