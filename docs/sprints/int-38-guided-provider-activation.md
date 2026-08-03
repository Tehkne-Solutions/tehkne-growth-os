# INT-38 — Guided Provider Activation

## Scope

- Connect Google Ads and Meta Ads directly from Unified Setup through the existing one-time OAuth state + PKCE flow.
- Return OAuth completion to the same workspace-scoped Setup route.
- Require explicit account selection after discovery and verify read-only access before marking a paid-media connection ACTIVE.
- Configure HubSpot Private App access through the encrypted vault after a read-only API test.
- Persist workspace-scoped HubSpot attribution property mappings in CRM connection settings.
- Make scheduled HubSpot ingestion consume the persisted attribution map.

## Security boundaries

- OAuth callbacks remain bound to the user who initiated the attempt.
- Provider tokens never reach the Setup page and are persisted only in the encrypted secret vault.
- HubSpot access tokens are accepted only by a same-origin, authenticated, RBAC-protected endpoint and are never returned to the browser.
- Paid-media account activation still requires explicit human selection.
- No Ads or CRM mutation capability is introduced.

## Guided lifecycle

Configured → OAuth/Tested → Account selected → Read-only verified → ACTIVE → Syncing.

Tehkné Solutions
