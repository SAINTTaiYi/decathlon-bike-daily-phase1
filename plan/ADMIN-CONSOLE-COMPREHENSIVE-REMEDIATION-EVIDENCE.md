# Admin Console Comprehensive Remediation Evidence

- Date: 2026-08-06
- Boundary: Preview only; Production and Production D1 untouched
- Implementation PR: #172
- Source commit: `0b4cb2bb561bac998f79101e46301a24c126d29a`
- Accepted merge/deployment identity: `db3ec5c80ae040ce753cebcd7659dc9daf391d26`
- Canonical Preview workflow: `deploy-cloudflare-preview.yml` run `31049667663`
- Preview URL: https://bike-ops-preview.geeklightonefish.workers.dev
- Preview D1: existing data retained; seed step was skipped; no reset, clear, reseed, restore, or migration-file change
- Production verification: V5.8.3 / `3ec28a321b1f1f02a28a0e4d94abb1be1432065b` unchanged
- Online asset: `/assets/index-D3tym4wX.js`; SHA-256 `85c796542958babd7aa44c7967e142329c4b3bd9dd3a8d379b5cfa7052c80615`

## Local and CI gates

- Targeted Web admin tests: 25/25
- Targeted Worker admin tests: 20/20
- Full repository tests: passed
- Full workspace typecheck: passed
- Workflow policies: 88/88
- Preview version check and production build: passed
- Implementation CI: `verify` and `secrets` passed
- CodeGraph: 220 files / 2,604 nodes / 8,680 edges, synced and up to date

## Independent online verification

Three consecutive cache-bypassed rounds verified endpoint-specific contracts: live returned `status=ok`, ready returned `status=ready`, and meta returned `environment=preview` plus `platform=cloudflare-workers-d1`; all identified V5.8.3 and exact SHA `db3ec5c80ae040ce753cebcd7659dc9daf391d26`. Unauthenticated admin read endpoints returned JSON 401. The Web shell returned 200 with HSTS, CSP `frame-ancestors 'none'`, DENY, nosniff, referrer and permissions headers; HTTP redirected to HTTPS with 308. The deployed bundle contained the admin-console, pending-count and one-time-password markers.

## Data and deployment boundary

The implementation diff contains no migration file. The canonical run's seed step was `skipped`, so the existing Preview D1 acceptance data was not cleared, reset, restored, or reseeded. Production remained on its prior V5.8.3 runtime identity and was not deployed.

## CodeGraph exception

Recovery started after an interrupted turn had already written the draft, so the first observed gate is explicitly a late recovery analysis, not a claimed true pre-edit gate. Subsequent source changes were synchronized before commit and after completion. CSS and Markdown are non-indexed and were compensated by contract tests, build output, CI and online asset/header verification.
