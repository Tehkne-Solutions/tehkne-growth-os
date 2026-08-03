# INT-31 — CRM & Lead Funnel Foundation

## Goal

Extend Tehkné Growth OS beyond paid-media delivery into a privacy-aware, read-only CRM funnel model: lead → opportunity → won/lost revenue.

## Canonical persistence

The migration introduces workspace-scoped CRM connections, canonical leads, opportunities and funnel events. Lead identity can be represented by a SHA-256 hash of normalized email or phone; raw email and phone are intentionally not persisted in the canonical Growth CRM tables.

CRM ingestion is idempotent by workspace + provider + external ID. Funnel events use deterministic SHA-256 deduplication keys.

## Growth Core projection

Canonical CRM events are always retained in `growth_crm_funnel_events`. They are projected to `growth_events` only when the active Sector Pack explicitly declares the event type. This prevents provider vocabulary from silently expanding the analytics contract.

Initial canonical event types:

- `crm_lead_created`
- `crm_lead_stage_changed`
- `crm_opportunity_created`
- `crm_opportunity_stage_changed`
- `crm_opportunity_won`
- `crm_opportunity_lost`

## First provider adapter: HubSpot

The first adapter is read-only and uses HubSpot CRM search endpoints for contacts and deals. It normalizes lifecycle stage, pipeline/stage, amount, currency and close status. Raw email/phone values are used only transiently to build the privacy-safe identity hash and are not returned as canonical properties.

The adapter keeps the API path configurable rather than hardcoding a permanent HubSpot API version. OAuth/token lifecycle wiring will reuse the encrypted secret provider in the next CRM connector increment.

## Security and boundaries

- `growth.crm.manage` is introduced as a dedicated permission and initially inherited by roles that already hold `growth.connectors.manage`.
- CRM sync is read-only.
- Access tokens are resolved only through the encrypted secret provider.
- No automatic campaign or CRM mutation is introduced.
- No cross-workspace matching is allowed.

## Next

INT-32 will add CRM connection/OAuth activation, scheduler integration, HubSpot contact↔deal associations and full-funnel metrics such as leads, opportunities, won revenue, CPL, CPA and ROAS where the Sector Pack declares them.
