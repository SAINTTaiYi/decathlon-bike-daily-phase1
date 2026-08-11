# Workshop Pickup reference alignment R4

## Scope

Preview-only follow-up. The user's second 1536×1024 screenshot is the sole Pickup target. Public V5.8.1, business handlers, API contracts, Production and D1 remain unchanged.

## Changes

- Removed the inherited desktop section air so Pickup controls begin at the target vertical coordinate.
- Split the ledger into six real columns: queue, vehicle/business, contact, appointment, status and operation. Missing appointment dates render an explicit dash.
- Restored one continuous rounded border around every collapsed row, while keeping the inner card borderless so no isolated right-edge frame remains.
- Restored muted waiting-status pills and black repair-origin pills.
- Matched the target Pickup search placeholder.
- Replaced the inert release aside with a native details/summary card: the entire card and plus affordance open the same upward announcement panel.

## Gates

- CodeGraph pre-edit: 198 files / 2,351 nodes / 7,766 edges, up to date.
- Targeted contracts, full repository tests, typecheck, 88 workflow policies and post-change CodeGraph passed. Registered build, PR/CI, Preview deployment and online verification continue below.
- CSS/Markdown are explicit CodeGraph non-indexed exceptions compensated by source contracts and byte-verified build/deployment assets.

## Final Preview evidence

- Candidate: `61442a56221f02dae92f66babade01443303664a`; deployed merge: `f222f6c2fbed8e63cea094954aafd5b9dda7666d`.
- PR: [#144](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/144); canonical Preview run: [30939333932](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30939333932) — success.
- Live/ready/meta all return V5.8.1 and exact deployed SHA.
- CSS `/assets/index-BC8NTY-L.css` SHA-256 `49fb10d52aa2c1fec01fba82696e9da4f6ac69703343100760e458107d6a9dae`; JS `/assets/index-DRJJKwmf.js` SHA-256 `91cf2c95ee30f61c2515ff606a78a12bbb55a6bda25ca368fdee58eb0aaebe35`; both match the verified local build byte-for-byte.
- HSTS, CSP frame-ancestors, X-Frame-Options DENY and HTTP→HTTPS 308 passed. Production/D1 untouched.
- browser-harness has no logged-in Chrome session; no in-app browser or Android Accessibility fallback was used. Human visual acceptance is required.
