# Desktop overview and pickup regression follow-up — 2026-08-04

## Accepted feedback
- First screen must be a genuine wide desktop workbench, rather than vertically stacked mobile cards.
- A desktop card reveal cannot change its column width or span neighbouring columns; it grows downward inside its existing column.
- Production pickup must retain a title and the `确认取车` action for unresolved records.

## Root causes and repair
1. `.workshop-overview-panel .ops-mobile-overview { display:block }` has greater specificity than the former desktop `display:grid`, so the desktop grid never activated.
2. The prior desktop fix made expanded cards span two columns, contrary to the desired fixed-width reveal.
3. `Boolean('false')` is truthy. Explicit completion parsing now accepts only `true`, `1`, `'1'`, or `'true'`; a missing title falls back to the visible maintenance/detail line without losing the pickup action.

## Boundaries
- Additive front-end presentation repair only; no D1/API/operation semantics change.
- Preview only; Production is awaiting user acceptance.
