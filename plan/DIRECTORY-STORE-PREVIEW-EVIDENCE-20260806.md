# Directory / Stores Unification Preview Evidence

- Date: 2026-08-06 (+08:00)
- Scope: merge the standalone Stores module into Directory; Preview only
- Public version: **V5.8.3 unchanged**
- Production target: `https://workshop.skin` — **not deployed or touched**
- Preview target: `https://bike-ops-preview.geeklightonefish.workers.dev`

## Source and review identity

- Implementation branch: `feat/directory-store-unification-preview`
- Implementation commits:
  - `4f16c9aa9852e3aa3d006172a8a277f1399cd0bf` — four-level Directory/Stores implementation
  - `2fe05d64d59a1b9fe9d837c274210ca1b1961050` — split Directory waterfall JSX rendering
- PR: [#174](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/174)
- PR checks: `verify` and `secrets` passed
- Ordinary merge SHA: `2dc7147b19015e0b65aa7087922e24ad7e966392`
- Merged into: `feature/cloudflare-workers-d1`
- Preview source manifest: public V5.8.3, 423 files, fingerprint `6581cfdd8b9431af5b6ffebf8b328e7e6641ed211d87b67a9f7f4aa1cba12d91`, recorded against `2fe05d64d59a1b9fe9d837c274210ca1b1961050`

## Functional scope

- Removed the standalone admin Stores navigation item; the admin console keeps five sections.
- Directory is now a same-page single-path waterfall: major region → subregion → city → compact store rows.
- Store rows expose code, name, status, member count, view, rename, and enable/disable actions.
- Store members expand inline; member display name and role can be edited, or membership can be removed while preserving the user and audit history.
- Added forward-compatible D1 migration `migrations/d1/0009_directory_subregions.sql`.
- Governance payload retains the flat `cities` field for forward compatibility.
- Preview deployment used `seed_preview_data=false`; existing Preview D1 data and acceptance seeds were preserved.

## Automated gates

- Targeted `node --test tests/admin-console.test.mjs`: **26 passed / 0 failed**.
- Full `pnpm test`: **pass** — domain/database/web 197, API 21, Worker 50.
- Full `pnpm typecheck`: **pass**.
- `pnpm check:workflows`: **pass**, 88 policies.
- `pnpm build`: **pass**; V5.8.3 Preview manifest accepted, Web 136 modules transformed, API/Contracts/Database builds passed.
- CodeGraph post-change sync/status: **220 files / 2,614 nodes / 8,794 edges, up to date**.
- `git diff --check`: **pass**.
- Markdown/CSS/font assets are explicit CodeGraph non-indexed exceptions; tests, build, deployment identity, and exact asset checks provide compensating coverage.

## Preview deployment

- Canonical workflow: `deploy-cloudflare-preview.yml` only.
- Run: [31082189466](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31082189466)
- `release_sha`: `2dc7147b19015e0b65aa7087922e24ad7e966392`.
- Free-plan, no-billing, and Preview-only guards passed.
- Remote D1 migration applied: `0009_directory_subregions.sql` — 7 commands, success.
- Worker/static assets deployment succeeded.
- Post-deploy API and Web shell verification succeeded.
- Acceptance seed step was skipped by explicit `seed_preview_data=false`.

## Independent online verification

A local read-only receipt was generated at `~/.local/share/rikkahub-resilience/workshop-directory-preview-verify-20260806/receipt.json` (receipt SHA-256 `7fe2e10321e7603d7b90b4256e391adbb1a52c0e65f754ea1215bbc0c6da2613`). Three cache-bypass rounds all passed:

- `/health/live`: `status=ok`, V5.8.3, exact merge SHA.
- `/health/ready`: `status=ready`, V5.8.3, exact merge SHA.
- `/api/v1/meta/version`: V5.8.3, exact merge SHA, `environment=preview`, `platform=cloudflare-workers-d1`.
- `/`: valid HTML5 shell, root mount, JS and CSS asset references.
- Required headers passed on API and HTML responses: HSTS, CSP, and `x-content-type-options: nosniff`; API responses also returned `cache-control: no-store, private`.

Published asset paths and exact SHA-256 values matched the local build byte-for-byte:

- `/assets/index-CBMVXUDm.js` — `4ceb6bc4784e5929620361d82b843310f8521518c38fd863392c50f6ce0f42e8`
- `/assets/index-BE_Upex1.css` — `64e7c13ecd29bda526a97a67a9ce8e5f987b16be0e8e5f43ce49608f04b5f0dc`

## Acceptance boundary and next step

This is an independently verified **Preview**, not a Production release. The next step is manual validation with the real CHU13 session at the Preview URL, covering the five-section console and the Directory waterfall/member interactions. A user acceptance reply means Preview acceptance only; it does not authorize a public version bump or Production deployment.
