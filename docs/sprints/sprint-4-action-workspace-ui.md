# Sprint 4 — INT-17 Action Workspace UI

## Objetivo

Fechar o ciclo operacional visível do Growth Intelligence sem automatizar mutações externas.

## Entregas

- rota `/command-center/action-workspace` preservando tenant e período do Command Center;
- navegação persistente entre Intelligence e Action Workspace;
- recomendações declarativas exibidas com prioridade, regra e versão;
- seção expansível de explicabilidade com evidências e checklist;
- materialização humana via API protegida existente;
- fila operacional por workspace;
- transições permitidas pela máquina de estados do backend;
- responsável, prioridade e origem da regra visíveis;
- estados vazios e falhas explícitas;
- nenhuma execução automática de mídia, orçamento, CRM ou outro sistema externo.

## Fluxo

`dados → sinal → recomendação → explicação → criar ação → aceitar → executar → concluir/rejeitar`

A UI não envia título, rationale, prioridade ou regra arbitrária ao backend. A materialização envia somente a `recommendationKey`; o servidor recalcula a inteligência autorizada e materializa o conteúdo canônico do playbook.

## Critério de saída

Um usuário com acesso ao Command Center deve conseguir abrir o Action Workspace no mesmo tenant/período, entender por que uma recomendação existe, materializá-la como trabalho humano e avançar somente pelas transições permitidas e auditadas.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
