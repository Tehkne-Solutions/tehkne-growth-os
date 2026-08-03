# INT-36 — Attribution Automation & Opportunity Propagation

## Scope

- Propagate a human-confirmed lead attribution link to CRM opportunities whose `primary_lead_id` references that lead.
- Preserve the original provider, account, campaign, evidence type/hash and confidence; propagated opportunity links are `CONFIRMED`.
- Rematerialize campaign attribution immediately after a human review and after successful scheduled CRM synchronization.
- Separate `OBSERVED`, `CONFIRMED` and `REJECTED` counts in campaign attribution metrics and coverage.
- Rejected evidence never contributes to attributed lead, won-deal, revenue or ROAS rollups.
- Temporal proximity remains invalid attribution evidence.

## Governance

Human review still requires `growth.attribution.review`, explicit workspace scope and AuditEvent emission. Raw evidence values and PII remain outside the analytical UI and attribution tables.

## Automation window

Scheduled CRM synchronization rematerializes attribution over the same bounded lookback used for full-funnel metric materialization (default 30 days, capped at 365). Human review rematerializes the exact period being inspected in Attribution Intelligence.

Tehkné Solutions
