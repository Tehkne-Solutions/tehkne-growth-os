# Provider Certification Handoff — Growth OS 1.0

Owner: **Tehkné Solutions**

This runbook is the deferred-provider handoff for Full Production Certification 1.0. It does not replace the strict production gate and does not permit mocks, placeholder credentials, or synthetic first-sync evidence to certify Google Ads, Meta Ads, or HubSpot.

## Runtime source of truth

Use the authenticated endpoint:

`GET /api/internal/provider-certification-handoff?workspaceId=<uuid>`

Header:

`Authorization: Bearer <CRON_SECRET>`

The endpoint returns each provider in one of four stages:

- `CREDENTIALS_REQUIRED` — required runtime/vault inputs are missing.
- `READY_TO_CONNECT` — infrastructure is ready; connect a real account.
- `FIRST_SYNC_REQUIRED` — an ACTIVE connection exists but first-sync evidence is incomplete.
- `CERTIFIED` — the provider has ACTIVE connection(s) with verified first-sync and watermark.

## Google Ads

Certification requires:

1. `CONNECTOR_SECRET_MASTER_KEY` available in runtime.
2. `GOOGLE_ADS_API_VERSION` configured.
3. Google Ads Developer Token stored in the encrypted platform vault.
4. Google OAuth Client stored in the encrypted platform vault.
5. OAuth completed using a real Google account.
6. Google Ads customer/account selected explicitly.
7. Connection becomes `ACTIVE`.
8. First sync persists `last_success_at` and `watermark`.
9. Production Readiness reports no critical provider/freshness failure.

## Meta Ads

Certification requires:

1. `CONNECTOR_SECRET_MASTER_KEY` available in runtime.
2. `META_GRAPH_API_VERSION` configured.
3. Meta OAuth Client stored in the encrypted platform vault.
4. OAuth completed using a real Meta account.
5. Ad Account selected explicitly.
6. Connection becomes `ACTIVE`.
7. First sync persists `last_success_at` and `watermark`.
8. Production Readiness reports no critical provider/freshness failure.

## HubSpot

Certification requires:

1. `CONNECTOR_SECRET_MASTER_KEY` available in runtime.
2. Real HubSpot credential configured through Setup.
3. Portal ID validated.
4. Attribution property mapping confirmed.
5. Connection becomes `ACTIVE`.
6. First sync persists `last_success_at` and `watermark`.
7. Leads, opportunities and revenue are available to the full-funnel runtime.

## Final promotion rule

Full Production Certification 1.0 is allowed only when:

- all three providers return `CERTIFIED`;
- unified onboarding is `productionReady=true`;
- Production Readiness returns `ready`;
- final RC smoke passes against Production;
- the real golden path is evidenced: Ads → CRM → Full Funnel → Attribution → Alert → Webhook → Ledger.

Until then, the approved release state remains `PRODUCTION_CANDIDATE_CORE`, with provider certification explicitly pending external credentials/evidence.

**Tehkné Solutions**
