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
