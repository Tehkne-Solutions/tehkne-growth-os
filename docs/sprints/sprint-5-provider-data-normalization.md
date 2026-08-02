# Sprint 5 — INT-26 Provider Data Normalization

## Objective

Normalize read-only paid-media performance from Google Ads and Meta Ads into the canonical Growth Data model without leaking provider-specific schemas into the Command Center.

## Canonical paid-media metrics

The normalization layer can produce:

- `spend`;
- `impressions`;
- `clicks`;
- `ctr`;
- `cpc`;
- `conversions` when the provider mapping is semantically safe.

CTR and CPC are derived centrally from spend/clicks/impressions so provider-specific units do not diverge. Meta conversions are intentionally not inferred from generic `actions` in this increment.

## Sector Pack boundary

Provider records may produce more canonical metrics than the selected Sector Pack declares. Persistence accepts only metric IDs declared by that pack and reports skipped IDs. This preserves the Sector Pack as the semantic contract.

## Idempotency

Connector observations receive a SHA-256 `source_key` derived from workspace, provider, external account, campaign, date and metric. Replaying the same provider window therefore does not duplicate observations.

## Provider readers

- Google Ads: campaign + day through `googleAds:searchStream`, with cost converted from micros and conversions read from the provider metric.
- Meta Ads: campaign-level Insights API with `time_increment=1`, paginated through `paging.next`.

## Sync lifecycle

`connection → provider read → canonical normalization → Sector Pack filter → idempotent persistence → checkpoint → freshness`

Successful runs advance the watermark only after persistence. Failed runs increment the checkpoint failure counter and keep the previous watermark.

## Security

All requests remain read-only. Access tokens are read from opaque `secret_ref` values and never copied into metric observations, sync runs, logs or public return values.

Copyright © 2026 Tehkné Solutions. Todos os direitos reservados.
