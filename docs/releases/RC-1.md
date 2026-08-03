# Growth OS — Release Candidate 1

Release: `RC-1`
Owner: Tehkné Solutions
Status: candidate

## Objective

Validate the already-hardened Growth OS build against a real published environment before declaring Production Candidate 1.0.

## Required environment

- `GROWTH_OS_BASE_URL`: public HTTPS deployment URL.
- `CRON_SECRET`: production/staging scheduler secret.
- `WORKSPACE_ID`: validation workspace with representative connectors configured.
- `VERCEL_TOKEN`: GitHub Actions secret used only by the manual RC deployment workflow.

Never commit these values.

## Automated gates

1. `npm ci`
2. `npm run security:audit`
3. `npm run db:validate`
4. `npm run db:generate`
5. `npm run lint`
6. `npm run typecheck`
7. `npm run test`
8. `npm run build`
9. `npm run smoke:rc`

`smoke:rc` validates the public surface, required security headers and the authenticated production-readiness endpoint. Any HTTP 5xx, missing mandatory header, failed readiness check or `blocked` readiness status fails the candidate.

## Vercel RC deployment

The manual GitHub Actions workflow `Release Candidate Deploy` is the canonical deployment entrypoint for RC validation. It installs the Vercel CLI, links the repository non-interactively, creates a preview or production deployment, records the resulting URL and executes `npm run smoke:rc` against that exact deployment.

Required GitHub Actions secrets:

- `VERCEL_TOKEN`
- `CRON_SECRET`
- `RC_WORKSPACE_ID`

The Vercel project must contain the runtime environment variables documented by production readiness, including database, vault, OAuth/provider configuration and scheduler secrets. The workflow does not copy secret values into source control.

## Real-operation validation

The RC is not approved from CI alone. Record evidence for each item:

- Public deployment responds over HTTPS.
- Security headers are present on the published URL.
- Production-readiness returns a non-blocked state for the validation workspace.
- Scheduler executes with the deployed `CRON_SECRET`.
- Google connector first-sync completes and persists data.
- Meta connector first-sync completes and persists data.
- HubSpot connector first-sync completes and persists data.
- Full-funnel processing completes after ingestion.
- Attribution processing completes after funnel processing.
- At least one operational alert is evaluated.
- Webhook delivery ledger records the delivery and real attempt count.
- Retry behavior is observed for a transient failure without retrying permanent 4xx responses.

## Golden path

`connector ingest -> first-sync -> full funnel -> attribution -> alert evaluation -> webhook delivery -> delivery ledger`

The same workspace must be used across the golden-path evidence so correlation is auditable.

## Release decision

### GO

All automated gates pass, the public environment is non-blocked, all required first-sync validations have evidence, the golden path completes, and no unresolved high/critical security finding exists.

### NO-GO

Any automated gate fails; readiness is `blocked`; a required connector first-sync is unverified; scheduler authentication fails; the golden path cannot complete; delivery evidence is missing; or a high/critical production dependency vulnerability exists.

## Rollback

1. Stop scheduler execution for the affected environment.
2. Roll back the deployment to the last known-good release.
3. Do not roll back database migrations destructively; restore application compatibility forward unless an explicitly tested database rollback exists.
4. Re-run production readiness against the restored deployment.
5. Resume scheduler only after readiness is non-blocked.
6. Record incident cause, affected workspace(s), release SHA and remediation.

## RC evidence record

Before promotion, capture:

- Release commit SHA
- Deployment URL
- Deployment identifier
- Validation workspace ID
- CI run
- `smoke:rc` output
- Scheduler execution evidence
- Google first-sync evidence
- Meta first-sync evidence
- HubSpot first-sync evidence
- Golden-path timestamps/IDs
- Delivery ledger result
- Final GO/NO-GO decision

Only Tehkné Solutions release artifacts and signatures are used for this product.
