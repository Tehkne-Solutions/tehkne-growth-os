# Sprint 2 — Validation Checklist

## GDC-01 Sector Packs

- [x] contrato versionado definido;
- [x] duplicação de `id@version` bloqueada;
- [x] pack ativo resolvido pelo registry;
- [x] Tehkné, SimpleWay Academy e MAV representados por packs controlados.

## GDC-02 Growth Data

- [x] `GrowthEvent` tenant-aware;
- [x] `MetricObservation` tenant-aware;
- [x] métrica validada contra pack;
- [x] evento validado contra pack;
- [x] deduplicação de evento preparada.

## GDC-03 CSV

- [x] formato canônico documentado;
- [x] parser de linha;
- [x] parser de arquivo;
- [x] preview aceito/rejeitado;
- [x] campos CSV entre aspas;
- [x] fingerprint de idempotência tenant-aware;
- [ ] persistência do batch;
- [ ] replay seguro de importação duplicada.

## GDC-04 Persistence

- [ ] modelos Prisma;
- [ ] constraints tenant-aware;
- [ ] transação batch + observations + rejections;
- [ ] audit trail do import;
- [ ] testes PostgreSQL.

## GDC-05 Command Center

- [ ] query layer;
- [ ] KPIs fundamentais;
- [ ] filtros de período;
- [ ] empty/error/loading states;
- [ ] isolamento entre workspaces validado end-to-end.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
