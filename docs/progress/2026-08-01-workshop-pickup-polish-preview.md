# Workshop Pickup Card and Toolbar Polish - Preview checkpoint

- Date: 2026-08-01
- Scope: Preview only. Production and Production D1 are prohibited.
- Base: `feature/cloudflare-workers-d1` at `e6addc79106e2f9c71d0e56708884b7ce1194845`.
- Expanded card: reuses the exact Add Pickup signal surface `var(--pickup-yellow)` and diffuse shadow `0 0 22px var(--pickup-glow), 0 7px 18px rgb(64 55 34 / .1)`.
- Motion: detail content remains mounted; a content-sized `0fr` to `1fr` grid reveal coordinates opacity and slight translation with natural deceleration. Closed content is `inert` and `aria-hidden`; reduced-motion is immediate.
- Toolbar: search, filter, sort, density, and collapse behavior and labels are unchanged. The row now uses one warm shared surface, restrained separators/depth, and signal-yellow focus treatment.
- Files: `apps/web/src/components/pickup/PickupLedger.jsx`, `apps/web/src/styles/pickup-ledger.css`, `tests/pickup-card-toolbar-polish.test.mjs`.
- CodeGraph: true pre-change sync/status completed before source writes; post-change sync/status is part of the frozen local gate. CSS and Markdown are explicit non-indexed exceptions covered by source-contract tests, full tests, build, and readback.
- Candidate: `5ac0036f51d3b95cd58b478f769c72e7dbfe1368`.
- PR: #124; `verify` and `secrets` passed; normal merge SHA `531147424ad9073bdaf969df0cfa665de3cd64ca`.
- Protected Preview: run `30665280040` succeeded at the exact merge SHA, including free/no-billing/Preview-only guards, validation, Preview D1 migrations, Worker/Static Assets deployment, and workflow online acceptance.
- Independent verification: `live`, `ready`, and version meta passed; exact Git SHA, HSTS, CSP, HTTP 308, signal-yellow/glow CSS, and content-sized reveal CSS passed. Production version identity remained unchanged.
- Browser acceptance: independent browser-harness is unavailable on this device; per user rule no in-app browser or Android Accessibility fallback was used. Awaiting human authenticated visual acceptance.

## Human feedback revision: solid yellow and measured motion

- Human rejected the first Preview because a higher-specificity legacy expanded-card rule still rendered the card pale yellow and intrinsic grid-track interpolation felt sluggish on content-heavy cards.
- Corrected surface contract: Add Pickup and the complete expanded-card surface share the fixed opaque token `--pickup-action-yellow: #ffc31a`; summary/detail surfaces are transparent to that solid parent surface, with no pale/translucent/warm-white card layer.
- Corrected motion contract: `useLayoutEffect` measures detail `scrollHeight`, animates explicit pixel height, switches to `height: auto` after expansion, and measures the current rendered height before collapse. `ResizeObserver` and reduced-motion behavior are retained.
- CSS and Markdown remain explicit CodeGraph non-indexed exceptions; JSX impact is covered by targeted contract tests, full tests, typecheck, build, CI, and online asset readback.

### Corrected Preview evidence

- Candidate: `5c77b1943d408b6f1a176f23eaf6d05a7c0f4816`.
- PR #126: `verify` and `secrets` passed; normal merge/actual deployed SHA `03373217a94025728bb8aea61da20bef7b6e24b3`.
- Protected Preview run `30696591412` succeeded with free/no-billing/Preview-only gates, full validation, Preview D1 migrations, Worker/Static Assets deployment, and workflow online acceptance.
- Worker Version ID: `eba885b1-127a-47fe-b98a-0afc0a896526`.
- Independent online verification: exact SHA, live/ready/meta, HSTS, CSP, HTTP 308, shared opaque `#ffc31a`, higher-specificity full-card rule, transparent internal card surfaces, measured `scrollHeight`/`ResizeObserver`/`transitionend` motion, and absence of legacy grid interpolation passed.
- Online CSS SHA-256: `ac26eae16f1c09421283534624c674f95ee230f4bb50e5827ea660688855ccd0`; JS SHA-256: `c6e71d1144def7ec33e1fdba9bd1264a5be258804cba04437e65fe21df951432`.
- Production version identity remained byte-for-byte unchanged. Production and Production D1 were not touched.
- Browser-harness remains unavailable; no in-app browser or Android Accessibility fallback was used. Awaiting authenticated human visual acceptance.
