# Production Readiness Runbook

## Objective

Operate Tehkné Growth OS in production with explicit evidence that paid-media and CRM integrations are not only connected, but have completed a successful first synchronization and remain observable.

## Required environment

Core production variables:

- `APP_URL`
- `SESSION_SECRET`
- `CONNECTOR_SECRET_MASTER_KEY`
- `CRON_SECRET`

Google Ads when enabled:

- `GOOGLE_ADS_API_VERSION`
- `GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF`
- `GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF`

Meta Ads when enabled:

- `META_GRAPH_API_VERSION`
- `META_ADS_OAUTH_CLIENT_SECRET_REF`

Operational delivery:

- `OPERATIONS_ALERT_WEBHOOK_URL` — recommended for production.
- `OPERATIONS_ALERT_WEBHOOK_BEARER` — optional bearer credential for the receiver.

Secret values must remain in the encrypted vault or deployment secret store and must never be copied into connector-domain rows.

## VERIFIED connector criterion

A provider is `VERIFIED` only when all of its ACTIVE connections have:

1. at least one successful synchronization;
2. a persisted watermark;
3. no rollout-blocking connector failure.

An OAuth-complete or ACTIVE connection without first-sync evidence remains `CONNECTED`, not `VERIFIED`.

## Production scheduler

The internal scheduler endpoint remains:

`GET /api/internal/connectors/scheduler`

It requires `Authorization: Bearer $CRON_SECRET`.

A scheduled round now allocates bounded budgets to both domains:

- Paid media: up to 30 seconds.
- CRM: up to 15 seconds.
- Remaining function headroom is reserved for alert evaluation, notification delivery and response serialization.

Paid media and CRM use separate PostgreSQL lease locks so an overlapping invocation cannot process the same domain concurrently.

## Operational notifications

After synchronization, the control plane derives one unified set of paid-media and CRM alerts:

- `connection_error`
- `repeated_failures`
- `never_synchronized`
- `stale_data`

When `OPERATIONS_ALERT_WEBHOOK_URL` is configured, candidates are sent by POST as `tehkne_growth_operations_alert` events. Deliveries are persisted with `PENDING`, `SENT` or `FAILED` state.

The same alert is deduplicated per workspace, severity and six-hour bucket. This prevents a three-hour scheduler from producing duplicate alert storms while preserving a later reminder if the condition remains unresolved.

Webhook failures do not hide the connector condition: the failed delivery remains in the ledger and the alert remains visible in Connector Operations.

## Readiness endpoint

Use:

`GET /api/internal/production-readiness?workspaceId=<uuid>`

with the same scheduler Bearer secret.

The endpoint returns only readiness metadata and the Tehkné Solutions signature. It does not expose secret values, access tokens or raw provider identifiers beyond normal workspace diagnostics.

Readiness states:

- `ready`: all required checks pass.
- `degraded`: no blocking failures, but at least one warning remains.
- `blocked`: a production gate failed, including missing critical environment configuration, unverified ACTIVE first sync, stale/failed scheduler pulse or critical connector failures.

## Production smoke command

Run after deployment and after connector activation:

```bash
GROWTH_OS_BASE_URL=https://<production-host> \
CRON_SECRET=<secret> \
WORKSPACE_ID=<workspace-uuid> \
npm run smoke:production
```

The command exits non-zero when readiness is `blocked` or the internal endpoint fails. A `degraded` result remains visible but does not fail the process, allowing optional channels such as the operations webhook to be introduced without pretending the core runtime is unavailable.

## Degradation actions

If first sync is not verified:

1. open Connector Operations for the workspace;
2. inspect provider status, watermark and recent run errors;
3. execute a protected manual sync when appropriate;
4. verify that `last_success_at` and watermark advance;
5. rerun `npm run smoke:production`.

If scheduler pulse is degraded:

1. verify `CRON_SECRET` matches GitHub/Vercel configuration;
2. inspect GitHub Actions scheduler execution;
3. confirm `GROWTH_OS_SCHEDULER_URL` targets `/api/internal/connectors/scheduler`;
4. use the Vercel daily Cron as fallback evidence, not as the three-hour primary cadence.

If notification delivery fails:

1. verify the receiver URL and optional Bearer token;
2. inspect the delivery ledger status/error;
3. do not silence the originating connector alert;
4. restore the receiver and validate on the next eligible delivery bucket.

## Release gate

A workspace is ready for production rollout only after:

- migration deploy succeeds;
- CI is green;
- the intended providers are ACTIVE;
- first-sync verification is complete;
- scheduler pulse is healthy;
- no critical integration failures remain;
- the smoke command reports `PASS`.

Tehkné Solutions
