# Reference desktop/tablet layout · Preview candidate

## Scope

- Reconstruct the authenticated Workshop UI for `>=1024px` from the supplied
  `1536 × 1024` references: a fixed 90px global header, 262px left rail, 66px
  module bar, overview workbench, Pending/Other/Repair ledger boards, and
  Sales check surface.
- Preserve all current business data, actions, API contracts, and the existing
  mobile composition below `1024px`.
- Retire the independent Used destination. `/used` and `/resale` redirect to
  Overview. Used-car sale and acquisition remain real KPI and Sales-form data.

## Implementation

- Five desktop destinations: Overview, Pending, Other, Repair, Sales.
- Overview uses a 5/7 closing-and-sales row, full four-operation index, and
  live-data trend/health surfaces.
- Pending, Other, and Repair use status/search controls and full-width ledger
  rows; expanded detail stays in the row and grows downward.
- The desktop header exposes menu, search, activity log, and user context.

## Verification before commit

- Targeted contracts: 22 pass, 0 fail.
- Full validation: domain 7, database 10, web 147, API 21, worker 28 pass;
  typecheck passed; workflow policy validation passed (88 policies).
- CodeGraph post gate: 197 files, 2,341 nodes, 7,711 edges, up to date.
- CSS and Markdown are CodeGraph non-indexed file-type exceptions. They are
  covered by source-contract tests, Vite production build in the next clean
  registration phase, and the documented visual acceptance cycle.
- `workshop-reference-layout-full-gates` stopped before tests because
  `version:preview` correctly rejects a dirty worktree. This was resolved by
  running the complete pre-commit gate before clean source registration.
