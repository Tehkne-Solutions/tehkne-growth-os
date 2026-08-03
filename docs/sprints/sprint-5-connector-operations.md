# INT-27 — Connector Operations & Scheduling

## Goal
Operate active paid-media connectors safely and repeatedly without manual data imports.

## Scope

- deterministic sync-window planning from connector watermark
- bounded exponential retry with jitter hooks
- provider rate-limit classification and retry hints
- OAuth token refresh before provider reads
- scheduler service for due active connections
- connector diagnostics data contract for UI
- no campaign mutation APIs; connectors remain read-only

## Safety invariants

1. A scheduler never receives raw credentials; it resolves only `secret_ref` values through the secret provider.
2. Refresh tokens remain in the encrypted vault and are rotated atomically after successful refresh.
3. Failed syncs never advance a connector watermark.
4. Rate-limit and transient failures are retried with a bounded policy; authorization failures are not blindly retried.
5. A workspace boundary is preserved on every scheduled run and diagnostics query.
6. Provider APIs remain read-only.
