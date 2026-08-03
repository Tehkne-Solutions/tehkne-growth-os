# INT-37 — Unified Onboarding & Connection Setup

## Objective

Turn paid-media and CRM connector infrastructure into one workspace-scoped setup surface.

## Delivered

- `/command-center/setup` protected by session, explicit tenant and `growth.command_center.read`.
- Readiness for Google Ads, Meta Ads and HubSpot.
- Configuration-presence checks without exposing secret values.
- Workspace-scoped connection counts and ACTIVE detection.
- Overall completion percentage and production readiness checklist.
- Persistent Command Center navigation entry for Setup.
- Deep link into Connector Operations for sync and health verification.

## Security boundary

The setup surface never renders provider credentials or vault payloads. It consumes only configuration presence and workspace-scoped connection metadata.

## Activation path

1. Configure the encrypted vault and provider references.
2. Complete the existing Google/Meta OAuth flow and explicit account selection.
3. Configure HubSpot and attribution-property mapping.
4. Verify ACTIVE connection status.
5. Run the first sync and verify freshness/health.
6. Confirm media, CRM and attribution data in the Command Center.

## Follow-up

Add provider-specific OAuth/setup CTAs and HubSpot attribution-mapping forms directly inside the unified setup surface while reusing the existing connector services.