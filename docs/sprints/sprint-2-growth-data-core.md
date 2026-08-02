# Sprint 2 — Growth Data Core

## Objetivo

Transformar a fundação segura do Tehkné Growth OS em um núcleo capaz de compreender dados de Growth de diferentes setores por contratos canônicos.

## Entregas

### GDC-01 — Sector Pack Registry

Status: implementado.

- manifestos declarativos e versionados;
- contratos TypeScript;
- validação estrutural;
- resolução de pack ativo;
- packs iniciais para Growth Services, Education e Creative Services.

### GDC-02 — Funnels, Metrics & Events

Status: implementado.

- eventos tenant-aware;
- observações de métricas;
- validação de métrica/evento contra Sector Pack;
- chave de deduplicação de evento;
- agregação básica.

### GDC-03 — CSV Import

Status: parser e preview implementados.

- linha canônica de observação de métrica;
- normalização de período, valor, fonte e moeda;
- parser de arquivo CSV com campos entre aspas;
- preview de linhas aceitas;
- relatório de rejeições por linha;
- arquivo de exemplo.

Próximo incremento: idempotência e persistência transacional do batch.

### GDC-04 — Persistence

Status: próximo.

Adicionar modelos Prisma para eventos, observações, import batches e rejeições, sempre escopados por workspace.

### GDC-05 — Command Center

Status: posterior ao GDC-04.

Primeiro dashboard operacional usando somente dados canônicos persistidos.

## Critério de saída da sprint

Um workspace autorizado deve conseguir selecionar seu Sector Pack, importar métricas por CSV de forma idempotente, persistir eventos/observações auditáveis e visualizar os KPIs fundamentais no Command Center.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
