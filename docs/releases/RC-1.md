# Growth OS — Release Candidate 1

Release: `RC-1`
Owner: Tehkné Solutions
Status: candidate

## Objective

Validate the already-hardened Growth OS build against a real published environment before declaring Production Candidate 1.0.

## Required environment

- `GROWTH_OS_BASE_URL`: public HTTPS Production URL for the external production smoke. The canonical Production alias is `https://tehkne-growth-os.vercel.app`.
- `CRON_SECRET`: production/staging scheduler secret.
- `WORKSPACE_ID`: validation workspace with representative connectors configured; `Release Candidate Deploy` resolves the canonical RC workspace from the deployed runtime when no override is supplied.
- `VERCEL_TOKEN`: GitHub Actions secret used only by the RC deployment/bootstrap workflows.

Never commit secret values.

## Automated gates

1. `npm ci`
2. `npm run security:audit`
3. `npm run db:validate`
4. `npm run db:generate`
5. `npm run lint`
6. `npm run typecheck`
7. `npm run test`
8. `npm run build`
9. RC runtime smoke for the selected target

For Production, `npm run smoke:rc` validates the public surface, required security headers and the authenticated production-readiness endpoint on the canonical public alias. Any HTTP 5xx, missing mandatory header, failed readiness check or `blocked` readiness status fails the candidate.

Preview deployments are intentionally protected by Vercel SSO. They are therefore validated through authenticated `vercel curl` requests against the exact immutable deployment rather than being treated as a public URL. The Preview gate enforces the same five mandatory security headers and the same non-blocked production-readiness contract without weakening Deployment Protection.

## Vercel RC deployment

The GitHub Actions workflow `Release Candidate Deploy` is the canonical deployment entrypoint for RC validation. It targets the Tehkné Solutions Vercel scope, installs the Vercel CLI, checks for the `tehkne-growth-os` project and creates it when absent, links the repository non-interactively, creates a preview or production deployment and records the exact deployment URL.

After deployment, the workflow calls `/api/internal/schema-readiness` and `/api/internal/rc-workspace` on that exact deployment using authenticated `vercel curl` requests and `CRON_SECRET`. Workspace discovery therefore happens inside the deployed runtime, where Sensitive Vercel environment variables such as `DATABASE_URL` are available without exporting their values to GitHub Actions.

The final smoke differs intentionally by target:

- **Preview:** the immutable deployment remains behind Vercel SSO. The workflow validates its root response, all mandatory security headers and `/api/internal/production-readiness` through Vercel-authenticated requests on that exact deployment.
- **Production:** the workflow first proves that the canonical public alias `https://tehkne-growth-os.vercel.app` is attached to the newly deployed Production deployment. Only after that alias-to-deployment gate passes does it execute `npm run smoke:rc` against the public alias.

This split prevents two classes of false evidence: a false negative caused by testing a protected deployment URL as if it were public, and a false positive caused by accidentally smoking an older Production alias.

Required GitHub Actions secrets:

- `VERCEL_TOKEN`
- `CRON_SECRET`

Optional override:

- `RC_WORKSPACE_ID` — when present, it takes precedence over runtime discovery. The UUID is not treated as a database credential; the override exists only for emergency/diagnostic compatibility.

The Vercel project must contain the runtime environment variables documented by production readiness, including database, connector-vault, provider and scheduler configuration. The workflows never print or copy Sensitive environment values into source control.

## Platform connector credential bootstrap

Google Ads and Meta Ads use platform-level credentials that must be supplied by the real provider accounts; Growth OS never invents these credentials and never stores them in source control or GitHub Actions.

The canonical encrypted vault references are code-owned defaults:

- Google Ads Developer Token: `growth-connectors/platform/google-ads/developer-token`
- Google OAuth client: `growth-connectors/platform/google-ads/oauth-client`
- Meta OAuth client: `growth-connectors/platform/meta-ads/oauth-client`

Deployment-controlled overrides remain supported through `GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF` and `META_ADS_OAUTH_CLIENT_SECRET_REF`, but they are optional. When absent, the canonical references above are used automatically.

The supported payload contracts are fixed by code:

- Google Ads Developer Token: `{ developerToken }`
- Google OAuth client: `{ clientId, clientSecret }`
- Meta OAuth client: `{ clientId, clientSecret }`

The Setup surface `/command-center/setup` exposes credential storage/rotation only to an authenticated user whose **same ACTIVE OPERATOR membership** contains both `identity.roles.assign_any` and `growth.connectors.manage`. The API is same-origin protected and does not accept arbitrary secret-reference paths.

Credential writes use the existing AES-256-GCM Postgres vault. Initial configuration or rotation and its `audit_events` record are committed in the same Prisma transaction. Audit metadata records the credential kind, non-secret reference, rotation state and Tehkné Solutions signature; secret values are never written to audit metadata.

The application only reports credential status (`configured` / `missing`). Current secret material is never returned to the browser or rehydrated into forms. Production readiness decrypts the resolved vault entries and validates their required payload shape; a configured reference alone is not evidence that provider infrastructure is ready.

Current provider environment contract:

- Google Ads API version: `v25`
- Meta Graph/Marketing API version: `v25.0`
- `CONNECTOR_SECRET_MASTER_KEY`: required for the encrypted vault
- HubSpot: uses the same encrypted vault for each connection token

External inputs that must remain provider-/operator-supplied:

- Google Ads Developer Token
- Google OAuth Client ID and Client Secret
- Meta App/Client ID and App Secret
- HubSpot numeric Portal ID and Private App access token
- a real `OPERATIONS_ALERT_WEBHOOK_URL` destination for out-of-band operational alerts

After those inputs are supplied, Google/Meta still require the real OAuth grant and explicit account selection; HubSpot validates the supplied Private App token with a real read before creating an ACTIVE connection. First-sync evidence cannot be fabricated or replaced by configuration-only checks.

## RC workspace bootstrap

The canonical isolated validation tenant is:

`Tehkné Solutions -> TKN Growth RC -> RC Validation`

with slugs:

- operator: `tehkne-solutions`
- client: `tkn-growth-rc`
- workspace: `rc-validation`

The bootstrap has two independently tested implementations:

- PostgreSQL validation fixtures: `scripts/rc-workspace-inspect.sql`, `scripts/rc-workspace-bootstrap.sql` and `scripts/rc-workspace-id.sql`;
- production runtime service: `src/modules/growth-operations/rc-workspace.ts` exposed only through the authenticated internal endpoint `/api/internal/rc-workspace`.

The SQL gate runs against PostgreSQL 16, applies the bootstrap twice and requires exactly one canonical workspace and one `rc.workspace.bootstrap` audit record. The runtime service is separately covered by integration tests and uses Prisma inside the Vercel runtime rather than exporting `DATABASE_URL`.

### Runtime endpoint

`GET /api/internal/rc-workspace`

- requires `Authorization: Bearer <CRON_SECRET>`;
- is read-only;
- returns `ready` plus `workspaceId`, or `missing`;
- never returns database credentials.

`POST /api/internal/rc-workspace`

- requires the same `CRON_SECRET` bearer authentication;
- accepts only the exact confirmation matching `VERCEL_TARGET_ENV`/`VERCEL_ENV`;
- Production requires `APPLY_RC_WORKSPACE_PRODUCTION`;
- Preview requires `APPLY_RC_WORKSPACE_PREVIEW`;
- performs an idempotent transaction and writes `rc.workspace.bootstrap` audit evidence.

### Production approval

Production bootstrap is never triggered by a normal push or pull request. The mutation path is an auditable GitHub issue:

`[RC] APPLY_RC_WORKSPACE_PRODUCTION`

The `RC Workspace Bootstrap` workflow accepts that event only when the issue author association is `OWNER`, `MEMBER` or `COLLABORATOR`. It validates the bootstrap against PostgreSQL 16 first, checks whether Production is already ready, applies the exact Production confirmation only when necessary, verifies the workspace afterwards, publishes the `TKN RC Workspace/Production` commit status and comments the resolved workspace UUID on the approval issue.

This keeps the database credential inside Vercel while preserving explicit human authorization and GitHub audit history.

## Real-operation validation

The RC is not approved from CI alone. Record evidence for each item:

- Public Production alias responds over HTTPS.
- Security headers are present on the published Production alias.
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
- Immutable deployment URL
- Canonical Production alias
- Deployment identifier
- Validation workspace ID
- CI run
- Production `smoke:rc` output
- Protected Preview smoke output when applicable
- Scheduler execution evidence
- Google first-sync evidence
- Meta first-sync evidence
- HubSpot first-sync evidence
- Golden-path timestamps/IDs
- Delivery ledger result
- Final GO/NO-GO decision

Only Tehkné Solutions release artifacts and signatures are used for this product.
