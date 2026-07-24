# Ark Endfield Overview + Pickup Refactor

## Contract

- Family: `endfield`
- Depth: `2 / moderate`
- Scope: authenticated Overview and Pickup only
- Primary task: assess live store work, prioritize pending pickup records, update notification state, and confirm pickup without obscuring business facts.

## Immutable boundaries

- Keep the React/Vite architecture, route/scene ownership, shared components, field order, data contracts, API calls, D1 schema, permissions, audit events, and operation handlers unchanged.
- Keep the existing pickup code validation and non-persistence behavior unchanged.
- Do not add Hypergryph, Endfield, Marathon, Bungie, bicycle, character, or proprietary assets or fonts.
- Do not add external media, continuous animation, scroll interception, fake telemetry, or decorative system codes.

## Implementation decisions

- The selected Endfield family is expressed with an original cold-white field surface, charcoal operational structure, Solar Yellow signal surfaces, squared geometry, clipped display bands, and one short hover feedback layer.
- Overview retains its real-data priority ordering and existing abstract signal field. Its core sales KPI is a charcoal decision surface with a Solar Yellow state plane. The business map remains a non-uniform map of actual unresolved work.
- Pickup retains its current source, notification, pickup-date, payment/warranty, completion, and delete behavior. The header, queue folio, ledger, primary action and pickup-code dialog receive the same Endfield family treatment.
- Labels, helper/error content, controls, entered values, keyboard behavior, focus, forced-colors and reduced-motion handling stay protected.

## Validation plan

1. Run the focused Ark scope test and all existing Web tests.
2. Run typecheck, production Web build, Worker typecheck and Worker bundle.
3. Restamp the version manifest after the final source and checkpoint documents are complete.
4. Run the existing frontend quality gate.
5. Use Browser Harness for desktop and portrait visual and interaction verification when available. Do not claim that verification if the Harness remains unavailable.

## V5.9.1 validation repair

- Scope remains the same authenticated Overview + Pickup-only visual refactor; no framework, route, API, Worker, D1, permission, audit, field or business-flow change was made.
- The focused Ark regression test now matches the final CSS responsibility boundary: the Ark layer owns its Pickup forced-colors fallback, while the shared Signal Grid glitch layer owns reduced-motion fallback.
- The repair has passed focused Ark tests 4/4, the full suite (Domain 4/4, Database 5/5, Web 143/143, API 16/16, Worker 11/11), and full TypeScript typecheck. Final build, Worker bundle, workflow and frontend-quality verification are rerun after this checkpoint is stamped.
- Candidate version: V5.9.1. Browser Harness remains unavailable, so no browser visual or interaction acceptance is claimed.

## V5.9.1 final verification — 2026-07-24

- V5.9.1 supersedes V5.9.0 as the PR candidate only to register the post-CSS-consolidation Ark regression-test repair and its release notes/manifest; it does not change the Endfield visual scope or any operational implementation.
- Final local evidence: focused Ark test 4/4; Domain 4/4; Database 5/5; Web 143/143; API 16/16; Worker 11/11; recursive TypeScript typecheck; Worker typecheck; contracts build; Worker bundle; version/diff checks; workflow policy validator 88/88.
- Production Web build: JavaScript 424,509 bytes / gzip 140,053 bytes; CSS 281,409 bytes / gzip 61,098 bytes, within the 61,440-byte CSS budget. Self-hosted signal material remains 365,660 bytes.
- Frontend-quality audit passed: zoom, skip-link, tabindex, native controls, image alt, reduced motion, high contrast, forced colors, touch targets and VisualViewport.
- Browser Harness is unavailable in this environment; no browser visual or interaction acceptance is claimed.
- Next: stage only the tracked V5.9.1 repair files, run pre-commit diff and credential scans, commit, open a normal PR, wait for CI, merge normally, then deploy Preview only.

## V5.9.2 CI-margin consolidation — 2026-07-24

- PR #53 CI run 30087496334 failed only because Node 22 measured the stylesheet at 61,676 B gzip, 236 B over the fixed 60 KiB quality limit; secrets passed and no functional, data, permission or workflow check failed.
- V5.9.2 removes only scoped Ark overrides that were already supplied by shared Signal Grid layers. It preserves the original Endfield Level 2 Overview decision plane, Pickup clipped module head, Solar Yellow primary action, Pickup ledger and dialog structural anchors, responsive composition and forced-colors fallback.
- Current local Node 24 pre-final measurement: CSS gzip 60,758 B, JavaScript gzip 140,044 B, signal material 365,660 B; all remain inside the local quality gate. Node 22 CI is the release authority for the cross-runtime margin.
- No React/Vite architecture, scene ownership, route, data contract, API, Worker, D1, migration, business action, permission, audit or deployment workflow changed.
- Next: run the complete V5.9.2 local gate, then push the normal PR update and wait for CI before merge or Preview deployment.

## V5.9.2 final local verification — 2026-07-24

- Final local gate passed: focused Ark 4/4; Domain 4/4; Database 5/5; Web 143/143; API 16/16; Worker 11/11; full TypeScript typecheck; Worker typecheck; contracts build; Worker bundle; version/diff checks; workflow policy validator 88/88.
- Final production Web build: JavaScript 424,497 bytes / gzip 140,044 bytes; CSS 278,735 bytes / gzip 60,758 bytes, within the 61,440-byte local quality limit. Signal material remains 365,660 bytes.
- Frontend-quality audit passed: zoom, skip-link, tabindex, native controls, image alt, reduced motion, high contrast, forced colors, touch targets and VisualViewport.
- Node 22 CI remains the final cross-runtime acceptance authority; Browser Harness remains unavailable, so no browser visual or interaction acceptance is claimed.

## Release boundary

This is a Preview-only visual candidate after local validation, normal PR and CI. Staging requires separate explicit user approval. Production is forbidden.

## Checkpoint 2026-07-24

- Status: fully locally verified; normal PR and CI are next.
- Base: final V5.8.9 source `e262d45502f2ec15a2ff75a2b9dc46f8cc296395`.
- Branch: `feat/ark-endfield-overview-pickup`.
- Pre-version functional sources: `9d2a121f616df88b3864698537eaf60e773a4c3e`, `d9dfbee6ecee7f94a43d84601b1c5e9ef8b1a329`, `bebb99b9773f0ad44f228c76ef877aee21da8944`.
- Candidate version: V5.9.0. The version advanced from V5.8.9 through V5.8.10 to V5.9.0 because the project policy advances to the next minor once the patch position reaches 10.
- Changed files: `PulseScene.jsx`, `PickupScene.jsx`, scoped Endfield CSS import and stylesheet, focused regression test, version metadata and this contract.
- Invariants: no API, Worker, D1, migration, package dependency, permission, audit, workflow handler, route, field or data-contract changes.
- Final verification: Domain 4/4, Database 5/5, Web 143/143, API 16/16 and Worker 11/11 passed; full TypeScript typecheck, Worker typecheck, contracts build and Worker bundle passed; workflow policies 88/88 passed.
- Production Web build: JavaScript 424,708 bytes, gzip 140,172 bytes; CSS 283,651 bytes, gzip 61,313 bytes, below the 61,440-byte quality budget. Signal material payload remains 365,660 bytes. The frontend quality gate passed zoom, skip-link, tabindex, native-controls, image-alt, reduced-motion, high-contrast, forced-colors, touch-target and VisualViewport audits.
- Visual validation: Browser Harness is not available in this environment. No browser visual or interaction acceptance is claimed.
- Next: commit the final V5.9.0 metadata normally, open a PR, wait for CI, merge normally, then deploy Preview only for manual acceptance. Staging still requires separate explicit approval.
- Production: forbidden.
