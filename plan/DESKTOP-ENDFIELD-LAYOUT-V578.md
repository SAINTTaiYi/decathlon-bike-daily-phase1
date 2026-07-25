# Desktop Endfield layout refinement - V5.7.8

**Status:** implementation complete; pull-request validation pending
**Scope confirmed:** 2026-07-25
**Branch:** `feat/desktop-endfield-layout-v578`
**Base:** `2832585dbb60de2d4d84a4db5d51228b462b9659`

## Design contract

- **Family:** existing Endfield visual system. Preserve its mineral-white, charcoal, and single signal-yellow identity.
- **Depth:** moderate desktop workbench treatment. No new fake telemetry, product content, routes, actions, API behavior, business rules, or assets.
- **Desktop contract:** use the project’s existing `min-width: 1080px` desktop breakpoint. Below it, mobile behavior and layout are untouched.
- **Primary job:** make the authenticated staff workspace easier to scan and operate across all business modules by establishing a wide-screen decision surface, fixed reading path, readable line lengths, clear record actions, and stable desktop dialog/login sizing.

## CodeGraph pre-change gate

- Fresh worktree initialized at the integration base: 167 files, 1,862 nodes, 5,677 edges; status was up to date.
- `explore App workspace main navigation modules desktop layout` mapped the app entry to header, closing summary, release notes, head image, scene modules, dialogs, and action dock.
- `explore LookbookHeader ClosingSummary ActionDock MainHeadImage` and the shared `RecordLedger` exploration confirmed that the desktop change can stay CSS-only: the four record scenes share `RecordLedger`; the app owns ordering and all business callbacks.
- `affected` for prospective JSX surface files found no directly mapped tests. No JSX is changed.
- CodeGraph does not index CSS in this project. CSS is therefore reviewed directly and the post-change gate will record this file-type exception, then run `sync`, `status`, and `affected` for the changed CSS/import/plan files.

## Planned desktop-only changes

1. Add a final `desktop-endfield.css` layer imported after `endfield.css`.
2. At `min-width: 1080px` only, create a two-column command surface for the header, current user strip, close summary, release notes, and workshop image.
3. Refine all existing business scenes into a sticky left decision column plus a broad operational surface, retaining their existing module content/order.
4. Increase desktop ledger scanability with wider metadata lanes and an action column without changing record semantics or mobile card layout.
5. Tune desktop dock, footer, login, first-run setup, loading/error, and dialogs. Keep native controls, focus behavior, reduced-motion handling, and touch behavior intact.

## Constraints

- Staging and Production are not authorized by this design task.
- Browser Harness is required for screenshot/manual browser evidence. It remains unavailable/prohibited in this environment, so visual screenshot acceptance cannot be claimed.

## Implementation checkpoint — 2026-07-25

- Added `apps/web/src/styles/desktop-endfield.css` and imported it after `endfield.css` in `apps/web/src/styles/index.css`.
- The new stylesheet contains exactly one `@media (min-width: 1080px)` wrapper, which is the project’s existing desktop breakpoint. It contains no root selectors or mobile/max-width overrides.
- Wide-screen changes cover: two-column top decision surface; masthead and active-user strip; closing summary, release notes, and workshop image; all scene title/content pairs; KPI and handover panels; the shared `RecordLedger` desktop metadata/action layout; fixed dock; footer; boot/login, setup, loading/error, and dialog scale.
- The existing root `data-ark-depth="maximal"` stays unchanged. The implementation is a restrained layout-density pass within the existing Endfield system, not a theme/depth rewrite.
- Static checks passed: balanced CSS braces, exact desktop breakpoint wrapper, import ordering, and `git diff --check`.
- CodeGraph post-change `sync`/`status` passed. CSS and Markdown are not parser-covered; `affected` returned no mapped tests, which is recorded as a coverage limitation rather than an omitted gate.
- Local build/test is blocked because the clean isolated worktree has no `node_modules`; the Ark UI audit script is not installed. Full test/typecheck/build must be established by the PR's clean-install CI. Browser Harness visual screenshots remain unavailable/prohibited, so visual acceptance is not claimed.

## Regression coverage

- `tests/desktop-endfield-layout.test.mjs` protects the desktop-only contract: the stylesheet uses the existing 1080px breakpoint once, adds no max-width/mobile rule, includes the command surface, scene, and ledger action selectors, and is imported after `endfield.css`.

## Validation evidence

- Offline frozen dependency installation completed with zero downloads.
- `pnpm check:workflows` passed 88 policies.
- Full `pnpm test` passed: Domain 5, Database 6, Web 104, API 16, Worker 13. The Web count includes the new desktop breakpoint/import regression test.
- `pnpm typecheck` passed for all typed workspaces.
- The first local `pnpm build` stopped at the expected Preview-source registration gate before asset compilation. CI performs `pnpm version:preview` before its build. The local post-commit build will use the same Preview registration without changing the public V5.7.8 version.
- Ark UI heuristic audit is unavailable because the local skill bundle does not expose its referenced script. Browser Harness visual screenshots are unavailable/prohibited, so no visual screenshot acceptance is claimed.

## Final local acceptance checkpoint

- Functional commit: `13e01afd809fd84cfa7a086bff9dd93d6771d680` (`feat(web): refine desktop Endfield layout`).
- Final CodeGraph gate: `sync` and `status` are up to date at 168 files, 1,868 nodes, and 5,683 edges. `affected` identifies only `tests/desktop-endfield-layout.test.mjs`; CSS/Markdown remain explicitly documented as non-parser-covered files.
- Final local checks passed: workflow policy 88/88, Domain 5, Database 6, Web 104, API 16, Worker 13 tests, TypeScript typecheck, `git diff --check`, Preview-version check, and production asset build.
- `pnpm version:preview` recorded the source fingerprint at commit `13e01af` and retained public V5.7.8; `pnpm build` then completed with web assets `index-DGkny4Ib.css` and `index-f8utbqia.js`.
- Browser Harness screenshot/manual interaction evidence is still unavailable/prohibited. This checkpoint confirms static, test, type, version, and build evidence only.
- Next: normal PR CI. No Preview, Staging, or Production deployment is authorized by this layout task.

## Integrated merge evidence — 2026-07-25

- PR [#62](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/62), `feat(web): refine desktop Endfield layout`, merged normally into `feature/cloudflare-workers-d1` as `7fcefeb3364cc884e3ff39dda6118176f8e89653`.
- PR CI `30149114857` passed both `verify` and `secrets`; post-merge CI `30149165649` passed on the exact merged SHA.
- The merged scope remains CSS-only desktop presentation at the existing 1080px breakpoint. Public version remains V5.7.8; mobile behavior and layout, runtime business contracts, Preview, Staging, and Production remain unchanged.
- The local CodeGraph administrative gate ran again on the merged baseline before this checkpoint: 168 files, 1,868 nodes, 5,683 edges, index up to date. This documentation-only edit requires no additional runtime test surface; CSS/Markdown parser coverage limitations remain recorded above.
- Browser Harness visual acceptance remains unavailable/prohibited. This records source, CI, and governance evidence only.
