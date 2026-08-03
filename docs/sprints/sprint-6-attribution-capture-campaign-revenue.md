# INT-34 — Attribution Capture & Campaign Revenue

## Scope

- Carry explicit attribution evidence from CRM ingestion without persisting raw identifiers in canonical CRM properties.
- Support configured HubSpot properties for Google click IDs (`gclid`, `gbraid`, `wbraid`), Meta click ID (`fbclid`), UTM campaign/source, and explicit campaign IDs.
- Persist evidence through the conservative attribution contract introduced in INT-33.
- Materialize campaign-scoped attributed leads, won deals, revenue, media spend, ROAS, and confidence counts in a dedicated table.
- Report attribution coverage separately from total full-funnel metrics.

## Guardrails

- Temporal proximity never creates an attribution link.
- Raw evidence values are SHA-256 hashed by the attribution foundation before persistence.
- UTM-only evidence remains MEDIUM confidence; explicit campaign/click identifiers remain HIGH confidence.
- Campaign attribution metrics are not inserted into `metric_observations`, preventing double counting in global Command Center totals.
- HubSpot attribution property names are configuration, not hard-coded assumptions.

## Next

INT-35 should expose campaign attribution coverage and campaign revenue/ROAS in the Command Center and add governed manual confirmation/rejection for ambiguous links.
