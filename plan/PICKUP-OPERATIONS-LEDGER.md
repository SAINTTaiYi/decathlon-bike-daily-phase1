# Pending Pickup Operations Ledger

**Status:** implementation complete; functional commit pending
**Branch:** `feat/pickup-operations-ledger`
**Base:** `1071761c774fbc01a8eeb37a4717a7085a8613ba`
**Public version:** V5.7.9 unchanged (Preview-only cycle)

## Scope

Only the Pending Pickup primary interface is redesigned. Repair, Other Handover, Used Bike, Sales, API contracts, permissions, audit history, D1 schema, and Production are unchanged.

## Accepted direction

The implementation combines the operational model of Square Order Manager, the resource-list hierarchy of Shopify Polaris, Linear's low-noise density, and Material/NN/g responsive disclosure guidance without copying any product's proprietary visual language.

- phone: one-column actionable cards;
- tablet and desktop: strict two-column equal-height grid;
- one expanded card at a time; expanded card spans both columns;
- compact sticky `02 / PICKUP` header with waiting and picked-up counts;
- 250 ms search debounce, hidden-field match reason, filter/sort sheet, applied-rule feedback, density persistence, collapse-all control;
- source icon plus Chinese label; self-pickup platform as a small suffix;
- repair pickup cards show a black outlined, mapped business-result label; repair details appear only when expanded;
- customer-storage summary appears in balanced density, hides in compact density, and remains complete when expanded;
- touch deletion exposes a button without deleting on gesture; desktop/keyboard deletion lives under More;
- successful pickup remains routed through the existing confirmation, audit, and deferred visual-completion callbacks;
- real empty state and filtered-no-result state are distinct; completed-today records remain available in a collapsed history section.

## Design-system alignment

`DESIGN.md` remains authoritative. This change adds one approved contextual token only:

- `--ops-pickup-expanded: #fff1dc` — the single expanded pickup card's low-emphasis warm focus surface.

It is not a general status color and cannot be reused as a decorative band.

## Changed implementation

- `apps/web/src/components/pickup/PickupLedger.jsx`
- `apps/web/src/styles/pickup-ledger.css`
- `apps/web/src/scenes/PickupScene.jsx`
- `apps/web/src/data/pickupRecord.js`
- `apps/web/src/styles/index.css`
- `DESIGN.md`
- `tests/pickup-ledger-ui.test.mjs`
- `tests/pickup-routing.test.mjs`

## Verified evidence so far

- pre-change CodeGraph: 185 files / 2,234 nodes / 7,619 edges;
- targeted pickup and UI tests: 20 passed, 0 failed;
- web package production build: 149 modules transformed successfully;
- earlier full web suite: 121 passed, 0 failed;
- earlier monorepo typecheck: passed;
- root build was not bypassed: it correctly requires a clean committed source SHA before Preview fingerprint registration.

## Final local gates

- Web regression suite: 121 passed, 0 failed;
- targeted pickup/UI suite: 20 passed, 0 failed;
- directly affected Web/report/session/cleanup tests: 31 passed, 0 failed;
- API suite: 21 passed, 0 failed;
- monorepo typecheck: passed;
- workflow policy validator: 88 policies passed;
- Web production build: 149 modules transformed successfully;
- post-change CodeGraph: 187 files / 2,271 nodes / 7,708 edges, index up to date; `PickupLedger` impact remains scoped to its own component and `PickupScene` is the only renderer;
- `git diff --check`: clean;
- local credential-pattern scan of every changed file: no matches;
- GitHub Secret Scanning API was unavailable because Advanced Security is not enabled; PR CI still runs the repository's pinned Gitleaks full-history job.

### Environment-only full-suite note

The Termux host runs Node 24 while `.nvmrc` and every GitHub workflow use Node 22. On Node 24, `pnpm test` reaches the Worker suite and has one stable failure in the untouched `http-redirect.test.ts`: Hono's malformed absolute-form URL parser returns `/api/v1/work-items` while the Node 24 WHATWG URL expectation is `/foo/api/v1/work-items`. `apps/worker`, dependencies, lockfile, and that test have no changes in this branch. Android/Termux could not launch the downloaded Node 22 binary, so GitHub CI is the authoritative Node 22 full-suite gate. No unrelated Worker security logic was modified.

## Remaining gates

1. functional source commit;
2. clean-tree `pnpm version:preview` registration and root build;
3. normal PR and green Node 22 CI, including pinned Gitleaks;
4. Cloudflare Preview deployment, independent endpoint checks, then human visual acceptance;
5. no Production deployment without a separate explicit request.
