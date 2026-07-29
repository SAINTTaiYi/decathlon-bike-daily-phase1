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

### 2. Module Flow structure — complete

- Added a boundary-aware wheel/touch/PageUp/PageDown state machine.
- A second boundary gesture is required before module switching, preventing accidental changes while internal lists and forms keep native scrolling.
- Six modules remain mounted but only the active module is exposed; local list/form state survives navigation.
- Added GSAP chapter handoff, global module header, boundary prompt and active navigation integration.
- Removed duplicate rendering of the overview and the legacy KPI scene from the active application shell.
- Verification task `workshop-21st-module-flow-build`: Web build succeeded.

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
