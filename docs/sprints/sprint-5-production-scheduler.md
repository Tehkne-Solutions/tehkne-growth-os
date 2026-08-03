# Sprint 5 — INT-29 Production Scheduler & Connector Control Plane

## Scope

This increment turns connector ingestion into a continuously triggerable production control plane without granting write access to ad platforms.

## Runtime contract

- `GET /api/internal/connectors/scheduler` is authenticated with `Authorization: Bearer $CRON_SECRET`.
- The endpoint fails closed when `CRON_SECRET` or the encrypted connector vault key is unavailable.
- A PostgreSQL lease lock prevents overlapping scheduler rounds.
- Scheduler runs are persisted with trigger source, status, budget, processed connection counts and alert count.
- A 45-second application budget leaves headroom below the 60-second Hobby function maximum.
- A deadline is passed to the connector scheduler so no additional connection is started after the budget expires.
- Failed connector syncs still do not advance their watermark.
- Control-plane alerts surface accounts that never synchronized, have three or more consecutive failures, are stale, or are explicitly in `ERROR`.

## Scheduling strategy

Vercel Hobby currently permits only one Cron execution per day. `vercel.json` therefore registers a daily fallback at 05:00 UTC.

For the current three-hour freshness SLO, `.github/workflows/connector-scheduler.yml` triggers the same production endpoint every three hours. The repository must define:

- `GROWTH_OS_SCHEDULER_URL`: full production URL ending in `/api/internal/connectors/scheduler`.
- `CRON_SECRET`: the same strong secret configured in the production deployment.

The production deployment must also define the connector runtime variables already required by manual sync: `CONNECTOR_SECRET_MASTER_KEY`, `GOOGLE_ADS_API_VERSION`, `GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF`, and/or `META_GRAPH_API_VERSION` according to the enabled providers.

## Safety boundaries

- Both Google Ads and Meta Ads remain read-only.
- The scheduler does not expose credentials in its response.
- Concurrent invocations are skipped while the lease is active.
- The Vercel fallback and GitHub Actions trigger share the same lock, run ledger and ingestion pipeline.
- Provider mutations remain outside scope.
