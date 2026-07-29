# Workshop 21st-inspired Design System Delivery

## Scope

One complete Preview delivery covering every existing Web surface: six authenticated modules, shared navigation, dialogs, forms, tables/lists, login, registration/OTP, one-time setup, password gate, governance, loading, offline, empty, error and update states. Business rules, routes, API contracts, permissions and V5.7.9 remain unchanged during Preview.

## Design inputs

- `DESIGN.md` remains the visual authority.
- 21st.dev Story scroll by Samira Boudjadja is used only as a behavioral reference for the strong top-level module handoff.
- Tabs, Accordion, Table, Drawer and Command Menu patterns inform shared structure and micro-interaction; their branding, colors, marketing typography and assets are not copied.
- Original project implementation uses the already-installed GSAP runtime and project-owned Workshop tokens.

## Verified stages

### 1. Baseline and inventory — complete

- Branch: `feat/workshop-21st-design-system` from `6c23d68a24a63aeda3cf74f89f5eb65e40e1f886`.
- Pre-change CodeGraph task `workshop-21st-codegraph-pre`: succeeded.
- Inventory: 6 modules, 5 authentication/security entry states, 12 shared dialogs, plus loading/offline/empty/error/update states.

### 2. Module Flow structure — complete, corrected after Preview feedback

- Preview feedback rejected the gesture-gated chapter overlay because it differed from the supplied Story Scroll reference and did not reliably support upward switching.
- Replaced wheel/touch/PageUp/PageDown interception with native continuous document scrolling. No second gesture, threshold or `preventDefault` remains.
- All six modules stay mounted and visible in document flow; local list/form state survives while the active header and dock follow scroll progress.
- Each later module rotates from 30 degrees to 0 around the bottom-left origin with GSAP ScrollTrigger `scrub`; each preceding module pins with `pinSpacing: false`. Reversing scroll automatically reverses the handoff.
- Reduced-motion users receive unrotated modules and directional active-scene updates without scrub animation.
- The duplicate overview/KPI rendering remains removed and all business handlers are unchanged.
- Focused module-flow regression passes 6/6 after the correction.

### 3. Full-site visual system — complete

- Added `workshop-system.css` as the final authoritative cascade for the six modules, shared navigation, records, forms, dialogs, drawers, governance, login, OTP/registration, setup, password gate, loading, offline, empty, error, update and toast states.
- Retired the loaded Endfield/desktop theme layers, paper-distress layers, 3D transforms, ScrollTrigger depth and blur-heavy workspace assembly.
- Preserved the accepted warm off-white, warm card, black structure, signal yellow, 8px geometry, restrained glow and project-owned typography from `DESIGN.md`.
- Removed stale `data-ark-*` theme markers from authentication and security entry shells; body text now uses the project sans stack with Chinese sans fallbacks.
- Kept pickup and repair completion feedback, swipe deletion, confirmation-pending states, dynamic visual viewport handling and reduced-motion/forced-colors behavior in the new authority layer.

### 4. Local verification — complete with one documented host exception

- Focused module-flow/material/layout tests: 12/12 passed after final typography and auth-shell cleanup.
- Complete Web regression: 121/121 passed (`workshop-21st-system-tests-v5`).
- Root typecheck passed (`workshop-21st-system-typecheck-v2`).
- Production Web build passed (`workshop-21st-system-build-v4`).
- Workflow policy validation passed all 88 checks (`workshop-21st-workflow-check`).
- Domain, database, Web and API portions of `pnpm test` passed. The Termux Node 24 host retains the pre-existing Worker malformed absolute-URL parser mismatch; Worker source and dependencies are untouched, and GitHub CI on pinned Node 22 is the authoritative full-suite gate.
- `browser-harness` is not installed. No prohibited application browser or Android accessibility fallback was used; visual page inspection remains blocked until that independent harness is available.
- Post-change CodeGraph sync is up to date: 191 files / 2,297 nodes / 7,698 edges. Markdown audit files are outside CodeGraph's indexed languages and are recorded as an explicit coverage exception.

## Current stage

Implementation and local gates are complete. No commit, push, PR, cloud deployment, Staging, Production or D1 mutation has occurred yet.

## Next exact step

Run post-change CodeGraph, commit the verified source, register the clean Preview fingerprint, open and merge a PR after Node 22 CI succeeds, then deploy and independently verify Preview identity and health endpoints.


## Preview delivery evidence

- Functional commit: `aec6c32bfaab603c0d68598dc009c2e96eacd8de`.
- Implementation PR: #92; Node 22 CI run `30447549748` (`secrets` and `verify` succeeded).
- Actual merge SHA and deployed identity: `24433d7ee24d92692a256b4bdb1e8f4e4fe1bfca`.
- Preview deployment workflow: `30447808839`, success; Free/no-billing/Preview-only guard passed.
- Cloudflare Deployment: `feca729a-4a3d-4bf3-8557-fa43d1fa05d5`.
- Worker Version: `b5e96278-8a03-436c-82b3-4edc85d4acee`, 100% traffic.
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`.
- Independent HTTP verification: `/health/live`, `/health/ready`, `/api/v1/meta/version` and Web shell all matched V5.7.9 / merge SHA; HSTS, strict CSP, DENY and `nosniff` were present.
- `browser-harness` remains unavailable, so screenshot/browser-driven visual verification was not performed. Human Preview acceptance is still required.
- Staging, Production and Production D1 were not modified. Public version remains V5.7.9.

## Preview feedback correction gate

- Corrected interaction: continuous native bidirectional Story Scroll; no gesture threshold, second-boundary prompt or fixed transition overlay.
- Final focused module-flow regression: 6/6 passed.
- Final complete Web regression: 121/121 passed.
- Root typecheck passed across contracts, database, Worker and API.
- Production Web build passed with 123 transformed modules.
- Workflow policy validation passed all 88 policies across 5 workflows.
- Post-change CodeGraph is up to date at 189 files / 2,283 nodes / 7,667 edges; Markdown and JSON evidence remain explicit unsupported-language exceptions.
- Root build is intentionally deferred until the clean functional commit is created and the unchanged V5.7.9 Preview source fingerprint is re-registered.
- No cloud deployment or database mutation has occurred in this correction stage.

## Bidirectional Story Scroll Preview delivery evidence

- Functional commit: `1ccaaf4accfc32342e9e28a8cf87cf1cd5611866`.
- Implementation PR: #94; Node 22 CI run `30455545537`, `secrets` and `verify` both succeeded.
- Actual merge/deploy SHA: `a1b9a49801a758b4f7bb2678fa559e7da655fdc8`.
- Protected Preview-only workflow: `30455820547`, success; Free/no-billing/Preview-only enforcement and remote-branch-head identity checks passed.
- Cloudflare Deployment: `0e9ea0bd-baf5-48aa-b1ea-fe3b8ab3d579`.
- Worker Version: `cb580368-27f6-449d-9a5a-f4ea7b2cba14` (#98), 100% Preview traffic.
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`.
- Independent HTTP verification: `/health/live`, `/health/ready`, `/api/v1/meta/version` and Web shell matched V5.7.9 / merge SHA; HSTS, strict CSP, DENY, `nosniff`, and API `no-store, private` were present.
- `browser-harness` remains unavailable. No prohibited application browser or Android accessibility fallback was used; human visual acceptance is still required.
- Staging, Production and Production D1 were not modified. Public version remains V5.7.9.

## Header, scroll stability and typography feedback correction

- Human Preview feedback identified duplicate module headings, a non-persistent Workshop header, the release log being covered by the bottom dock, scroll-time jitter, and runtime fallback to system fonts.
- The Workshop shell now owns two fixed header rows: global Workshop identity/context/actions above the active module identity. Module-local visual titles are screen-reader-only, so no second visible heading competes with the shell header.
- The overview-only `PICKUP BOARD` preview was removed while the independent Pickup module and bottom Pickup navigation remain intact.
- Pickup no longer portals or continuously remeasures a second fixed header. Queue controls remain inside the module, and card entry animation runs only once after first intersection.
- Story Scroll now ignores mobile viewport-only resize noise, debounces real resize/font refreshes, anticipates pins, and does not retain a blanket `will-change` layer.
- The release strip reserves bottom-dock space. Global alerts and shell content use the combined two-row header height.
- Runtime typography is limited to self-hosted `Noto Sans SC Variable` and `Barlow Condensed Ops`; system and generic fallback families are absent from the project runtime CSS. The Fontsource Noto package contributes 101 Unicode-range definitions and is bundled by Vite with no third-party runtime request.
- Focused feedback tests passed 21/21; complete Web regression passed 122/122; root typecheck, final Web build and all 88 workflow policies passed.
- Offline frozen install succeeded. The root build reached the expected Preview fingerprint gate and correctly stopped before a clean functional commit was registered.
- Post-change CodeGraph sync is up to date at 189 files / 2,274 nodes / 7,654 edges. Markdown and font assets are explicit unsupported-language/binary exceptions.
- `browser-harness` remains unavailable, so no prohibited browser or Android accessibility fallback was used. Human visual interaction acceptance remains required after the corrected Preview is deployed.
- No Preview redeployment, Staging, Production or D1 mutation has occurred in this correction stage. Public version remains V5.7.9.

## Current stage

The feedback correction and local gates are complete. Next: commit the verified source, register its clean Preview fingerprint without changing V5.7.9, run the clean root build, then open a PR for Node 22 CI and protected Preview-only deployment.

## Header and scroll stability corrected Preview evidence

- Functional source commit: `a01787d5b96dc9db68388841e290a953dee83c85`.
- Implementation PR: #96; Node 22 CI run `30464450946`, `secrets` and `verify` both succeeded.
- Actual ordinary merge and deployed identity: `d1540c201fc3bd29b6461756272f7b14bc3dba5d`.
- Protected Preview-only workflow: `30464847355`, success; exact remote branch-head, Free/no-billing/Preview-only, frozen install, full test/typecheck/build, Preview D1 migration, deploy and identity gates passed.
- Preview D1 reported `No migrations to apply`; Production D1 was not accessed or changed.
- Cloudflare Deployment: `8ed722ca-59c7-412b-b131-b2a965ba449d`.
- Worker Version: `c8296724-ccc0-432a-86d6-1476a23578cb` (#99), 100% Preview traffic.
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`.
- Independent HTTP verification confirmed `/health/live`, `/health/ready`, `/api/v1/meta/version` and the Web shell at V5.7.9 / deployed merge SHA, with HSTS, strict CSP, DENY, `nosniff`, restricted permissions and API `no-store, private`; HTTP redirects to HTTPS with 308.
- Online CSS contains 103 self-hosted font faces: 101 Noto definitions deduplicated by Vite into 98 Noto assets plus 2 Barlow assets. Runtime CSS has zero system or generic fallback declarations, and a representative Noto WOFF2 asset returns 200.
- Post-deploy CodeGraph sync remains up to date at 189 files / 2,274 nodes / 7,654 edges. Markdown evidence and font binaries remain explicit unsupported-language/binary exceptions.
- `browser-harness` remains unavailable. No prohibited application browser or Android accessibility fallback was used; human visual interaction acceptance is still required.
- Staging, Production and Production D1 were not modified. Public version remains V5.7.9.

## Acceptance boundary

This corrected Preview is now waiting for human acceptance. Do not deploy Production or change the public version without a separate explicit request after Preview acceptance.
