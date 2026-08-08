# Tehkné Growth OS — Production Candidate Core 1.0.0-rc.1

Signature: **Tehkné Solutions**

## Certification boundary

This release candidate certifies the Growth OS core platform and production control plane. It does **not** claim Google Ads, Meta Ads or HubSpot provider certification until real external credentials, account selection and first-sync evidence exist.

## Certified core capabilities

- Identity, tenancy, RBAC and workspace isolation.
- Growth intelligence, goals, signals, playbooks and governed publishing.
- Human action loop, outcomes, effectiveness and learning.
- Paid-media and CRM connector runtimes, OAuth/secret-vault foundations and normalized ingestion contracts.
- Full-funnel processing and attribution foundations.
- PostgreSQL migrations and runtime schema readiness.
- Scheduler orchestration, locking, budgets, freshness and failure detection.
- Operations alert evaluation, retry-aware webhook ledger and auditability.
- Production readiness endpoint, RC workspace bootstrap and public health/SHA observability.
- Security dependency gate and production build validation.
- Vercel Git deployment suppression/fallback/recovery controls.

## External certification still pending

The following remain intentionally `PENDING_EXTERNAL`:

- Google Ads Developer Token + Google OAuth client + real account first-sync.
- Meta OAuth client + real ad account first-sync.
- HubSpot Private App + real CRM first-sync.
- End-to-end provider golden path with real external data.

No mock or placeholder credential can promote these items to certified status.

## Public certification contract

`GET /api/health` exposes non-secret release evidence:

- `release.version = 1.0.0-rc.1-core`
- `release.channel = PRODUCTION_CANDIDATE_CORE`
- `release.coreStatus = CERTIFIED`
- `release.providerCertification = PENDING_EXTERNAL`
- `release.signature = Tehkné Solutions`
- Vercel environment and exact Git commit SHA when available.

## Core certification smoke gate

Run against the canonical Production deployment:

```bash
GROWTH_OS_BASE_URL=https://tehkne-growth-os.vercel.app \
CRON_SECRET=... \
RC_WORKSPACE_ID=93000000-0000-4000-8000-000000000001 \
EXPECTED_RELEASE_SHA=<main-sha> \
npm run smoke:core-cert
```

The gate requires:

- public health is available;
- release contract matches this Production Candidate Core;
- exact SHA matches when `EXPECTED_RELEASE_SHA` is supplied;
- Production readiness is not blocked;
- session, vault, scheduler auth, public URL, scheduler pulse and connector-error checks all pass.

Provider first-sync and operations webhook may remain warnings while their external credentials are intentionally deferred. This does not change the stricter full `productionReady` provider gate.

## Promotion rule

`Production Candidate Core` is approved independently from `Provider Certification`.

Full Growth OS 1.0 production certification requires the deferred providers to move from `PENDING_EXTERNAL` through connection and verified first-sync, followed by the real golden path.
