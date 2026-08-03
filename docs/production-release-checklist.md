# Tehkné Growth OS — Production Release Checklist

Signature: Tehkné Solutions

## Security gate

- `npm run security:audit` passes with no high/critical vulnerabilities in production dependencies.
- Global response headers include HSTS, nosniff, frame denial, strict referrer policy, permissions policy and cross-origin isolation defaults.
- `CRON_SECRET`, `SESSION_SECRET` and `CONNECTOR_SECRET_MASTER_KEY` exist only in the deployment secret store.
- Internal scheduler/readiness endpoints reject missing or invalid authorization.
- Provider access tokens and refresh tokens remain in the encrypted connector vault and never appear in logs or notification payloads.

## Data and connector gate

- PostgreSQL migrations deploy cleanly on an empty CI database.
- Google Ads, Meta Ads and HubSpot ACTIVE connections have completed first sync and have persisted watermarks.
- Scheduler has a successful recent pulse and no domain is lock-starved.
- No connector is in ERROR or has 3+ consecutive failures.
- Full-funnel and attribution materialization complete for the release workspace.

## Operations gate

- Operational webhook is configured for the production environment.
- Transient webhook failures retry within the bounded attempt budget.
- Permanent 4xx failures are not retried, except retryable 408/429 responses.
- Delivery ledger records attempts and final SENT/FAILED state.
- Delivery history can be queried per workspace for incident review.
- `npm run smoke:production` reports `ready` or an explicitly accepted `degraded` state; `blocked` forbids rollout.

## Quality gate

- Prisma schema validation passes.
- Prisma client generation passes.
- All migrations apply successfully.
- ESLint passes.
- TypeScript typecheck passes.
- Vitest passes.
- Next.js production build passes.
- Production dependency audit passes.

## Release decision

A production rollout is authorized only when every blocking item above passes. Warnings require a documented operator decision. A `blocked` production-readiness snapshot, failed CI, failed production dependency audit, or unverified first sync stops the release.
