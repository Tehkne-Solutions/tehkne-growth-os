# Tehkné Growth OS — Go-Live 1.0

Signature: **Tehkné Solutions**

## Release freeze

The certified Core candidate is `1.0.0-rc.1-core` on channel `PRODUCTION_CANDIDATE_CORE`.

While provider credentials remain external dependencies, the Core is frozen. Allowed work is limited to documentation, tests, provider certification, and explicitly reviewed security/release-blocker fixes. New Core features and non-essential schema changes move to the post-1.0 cycle.

## Promotion gate

Full Production Certification 1.0 requires all of the following at the same time:

1. Core certification remains valid.
2. Google Ads is CERTIFIED with real credentials, ACTIVE connection, first-sync, watermark and freshness evidence.
3. Meta Ads is CERTIFIED with real credentials, ACTIVE connection, first-sync, watermark and freshness evidence.
4. HubSpot is CERTIFIED with a real connection, first-sync, watermark and freshness evidence.
5. Production Readiness is `ready` and strict `productionReady=true`.
6. Final production smoke passes against the exact deployed SHA.
7. Scheduler pulse is healthy and authenticated.
8. Golden path is verified end-to-end: Ads → CRM → Full Funnel → Attribution → Alert → Webhook → Ledger.
9. No unresolved critical connector error exists.
10. Rollback target and operator are known before promotion.

## Go-live sequence

1. Record the exact Production SHA and public URL.
2. Read `/api/health` and confirm the release contract and served SHA.
3. Read the provider certification handoff for the RC workspace.
4. Complete deferred credentials in the encrypted vault; never place provider secrets in source control.
5. Connect Google Ads, Meta Ads and HubSpot real accounts.
6. Execute first-sync for each provider and verify checkpoint watermark/freshness.
7. Run Production Readiness and require `ready`.
8. Execute final production smoke.
9. Execute and capture evidence for the full golden path.
10. Promote to Full Production Certification 1.0 only if every gate is green.

## Rollback triggers

Rollback is mandatory if, after promotion, any of the following occurs and cannot be corrected safely within the release window:

- health endpoint fails or serves an unexpected release/SHA;
- authentication/session integrity is broken;
- migrations or data integrity checks fail;
- scheduler repeatedly fails or executes unauthenticated;
- a provider produces destructive, duplicated or materially incorrect persisted data;
- attribution produces a critical integrity regression;
- alert/webhook delivery causes an operational incident;
- a high/critical security regression is confirmed.

## Rollback procedure

1. Stop further promotion/synchronization activity.
2. Record incident time, Production SHA and failing gate.
3. Roll back the Vercel Production deployment to the last known-good SHA.
4. Disable affected connector schedules if persisted data could be harmed.
5. Do not reverse database migrations automatically. Use a reviewed forward-fix unless a tested database rollback procedure exists for the exact migration.
6. Re-run health and Core smoke on the restored deployment.
7. Re-enable integrations only after the affected provider/readiness gate is green.
8. Record the incident and corrective action before reopening promotion.

## Deferred external dependencies

Until credentials are provided, Google Ads, Meta Ads and HubSpot remain explicitly pending external certification. They are not mocked and must not be represented as certified.

## Post-1.0 scope

New Core features, non-essential schema changes, product experiments and architectural refactors should be planned after the 1.0 promotion unless formally classified as a security or release-blocker fix.
