# Desktop workbench density repair — 2026-08-04

## Scope
- Desktop / desktop-site viewport only: use the available workbench width, keep Workshop identity and business data unchanged.
- Preserve ordinary mobile behavior below 840px.

## Root causes confirmed
1. The shared pickup-card grid enabled row stretching at 600px and paired it with `min-height: 100%` / `height: 100%`; a tall peer made all cards in that row tall.
2. Handover reuses two `.pickup-detail-wide` blocks, while a generic pickup shortcut assigned every wide block to column 2, row 1, so the two handover details overlaid each other.

## Implementation
- Add an additive `desktop-workbench.css` final cascade (840px: 3 cards; 1280px: 4 cards) with intrinsic row/card heights and expanded cards spanning two columns.
- Mark shared cards as pickup, repair, or handover. Handover details use distinct single-column rows.

## Validation queue
- Run targeted layout contracts, full tests/typecheck/build, and CodeGraph post-change sync.
- Preview-only delivery and independent verification; Production remains untouched pending human acceptance.
