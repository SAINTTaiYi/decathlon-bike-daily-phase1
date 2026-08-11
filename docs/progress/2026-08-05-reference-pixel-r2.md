# Workshop 1536×1024 reference pixel reconstruction — R2

## Scope
- Human rejected Preview `152e0eaf`: desktop reference cascade did not activate on the actual high-DPR desktop-mode viewport and the result did not resemble the five supplied boards.
- Rebuild only Preview: Overview, Pending, Other Handover, Repair and Sales Check. Real data/API/actions remain; phone UI remains below 768 CSS px; Production/D1/public version remain untouched.

## Decisions
- Author the workbench at the supplied 1536×1024 native coordinate system and scale the complete canvas with `zoom: calc(100vw / 1536px)` so physical proportions survive device DPR.
- Restore the reference's sixth Used navigation/page without visually redesigning that page; preserve all used-car KPI fields.
- Fixed geometry: 90px global header, 66px module bar, 262px left rail, 1536px board width; target pages are mutually exclusive on desktop/tablet.
- Add the missing left-rail release card and use the existing self-hosted type system and real components.

## Gates
- CodeGraph pre-edit initialized and synchronized: 197 files / 2,341 nodes / 7,749 edges, up to date.
- Post-edit tests, typecheck, workflow policy, build, CodeGraph and Preview evidence are pending.

## Verified implementation evidence
- Target contracts: 20/20 passed; complete Web regression: 147/147 passed.
- Domain 7/7, Database 10/10, API 21/21, Worker 28/28 passed.
- TypeScript typecheck passed across all six applicable workspace projects.
- Workflow policy validation passed: 5 workflows / 88 policies.
- Pre-registration build stopped only at the expected clean-commit Preview-registration guard; no compilation error occurred.
- CodeGraph post-edit: 197 files / 2,346 nodes / 7,723 edges, up to date.
- Explicit CodeGraph exceptions: CSS and Markdown are not indexed; compensated by source contracts, full regressions, typecheck, workflow policy, clean diff, and the pending registered production build.

## Preview deployment evidence
- Source PR: [#140](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/140); required `verify` and `secrets` checks passed.
- Ordinary merge SHA / deployed identity: `dfbd72b3c9cfe49a7231c86c5d7f2db9693c7c6d`.
- Canonical Preview-only workflow: [run 30934010991](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30934010991), successful. Free-plan, no-billing and Preview-only guards passed; full validation, Preview D1 migrations, Worker/Static Assets deployment and workflow online acceptance all passed.
- Independent cache-bypassing probes repeatedly confirmed `/health/live`, `/health/ready` and `/api/v1/meta/version` as V5.8.1 / exact merge SHA / `environment: preview` / `platform: cloudflare-workers-d1`.
- HTTPS Web and API responses include HSTS, strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies; HTTP redirects to HTTPS with 308.
- Published CSS `/assets/index-hoOsJ1g8.css` SHA-256: `a7e031b21db1b0029b39f93a12e4adb389692d49efc9dae4a23f03bce5073744`.
- Published JS `/assets/index-9JDKKUHL.js` SHA-256: `d79b78711a3002f4bcb08fe2af871d97bbf781a8940dba7b26da90df66363d03`.
- Both published assets are byte-identical to the locally verified production build; online bundles contain the 1536×1024 canvas, fixed header/rail, release card, mutually exclusive desktop boards, two trend charts, sales instructions and full-width ledgers.
- Browser-harness 0.1.5 is installed, but its local doctor reports no running Chrome/daemon; the authenticated cloud browser has no Workshop login session. Per the user's browser rule, no in-app browser or Android Accessibility fallback was used. Logged-in visual acceptance therefore remains human-only.
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`.
- Production, Production D1 and public V5.8.1 were not changed.
