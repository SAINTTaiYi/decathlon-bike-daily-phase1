# V5.8.2 formal release evidence · workshop.skin

Released: 2026-08-05 05:39 +08:00 (Asia/Shanghai)
Status: released through the canonical Cloudflare path and independently verified. The live site is V5.8.2.

## Release identity

- Public version: V5.8.2 · 桌面工作台与移动端恢复
- Previous formal marker / exclusive range start: `880ce6c59b2ef2c026a3fba1d0ac0c98fca92aa3`
- Human-accepted Preview source: `8b98bff6a06f6a4778f40f889e4a0a633296af67`
- Formal release range: 38 commits
- Formal release candidate: `be8e0022806a9abe757637ba6b997ce7de5fe558`
- Release PR: #154 (`release/v5.8.2-mobile-desktop-aggregate` → `feature/cloudflare-workers-d1`)
- Ordinary merge / deployed SHA: `b29bfc660ce6128f3ae0227686bcb448e82f439e`
- Candidate changed only the five governed release paths. The merge additionally retained the already-verified R8 Preview evidence document from the target branch; no runtime source difference was introduced by that merge-only document change.

The formal announcement aggregates the accepted desktop reference workbench, business-area-scoped transition motion, shared ledgers and handover completion, plus mobile continuous-flow recovery and desktop-UI leak guards.

## Pre-release gates

| Gate | Result |
| --- | --- |
| Domain | 7 passing |
| Database | 10 passing |
| Web | 169 passing |
| API | 21 passing |
| Worker | 28 passing |
| Typecheck | all packages pass |
| Workflow policy | 88 policies pass |
| Version governance | production checker pass; V5.8.2 / 402 files / 38 formal-range commits |
| Build | registered production build pass |
| CodeGraph | 203 files / 2,385 nodes / 7,807 edges, up to date |
| PR #154 CI | `verify` and `secrets` success; CI run `30952352490` |

## Live D1 backup and restore drill

Completed before the release merge/deployment against `bike-ops-staging` / `91e78387-9b24-4126-a5a1-27f9c1792975`.

- Official read-only Cloudflare D1 `/export`; no SQL or `/query`
- Snapshot bookmark: `00000120-00000000-000050bd-62f5ef6897351c77ea46545bada39929`
- Plain SQL: 783,577 bytes; SHA-256 `3c435d704c3d1b75a40c6caebdf6dd95d652fcfda954f8a89a76e5e7dfe05205`
- Isolated SQLite restore: `integrity_check=ok`; `foreign_key_check` = 0 violations
- Restored content: 23 business/schema tables, 736 total rows, 7 D1 migration rows
- AES-256-GCM encrypted file: 783,685 bytes; SHA-256 `3b727419e3345c6548f35059e7a72086ded9edfbbd69da5792a7c36292797632`
- Decrypt round-trip matched the plaintext byte-for-byte
- Key and encrypted backup are separate, device-local mode-0600 files
- Plain SQL and the temporary signed URL result were deleted after verification

No D1 migration file changed between deployed V5.8.1 and V5.8.2. The canonical workflow's idempotent migration step succeeded, and the public schema identity remained `0002_work_item_ticket_numbers`.

## Production deployment

- Canonical workflow: `deploy-cloudflare-staging.yml` (`Deploy Cloudflare staging · free stack`)
- Run: `30953175191`
- Exact source: `b29bfc660ce6128f3ae0227686bcb448e82f439e`
- Free-plan, no-billing and staging-only confirmations passed
- Frozen install, full validation, D1 migration apply, Worker/static deployment and built-in identity verification all succeeded
- Target: `workshop.skin`; the historical `staging` environment label remains intentional
- No legacy EdgeOne workflow was used

## Independent live verification

The first independent probe set began only seconds after the workflow completed. Eight of nine endpoint responses already returned V5.8.2; one `/health/ready` response still came from V5.8.1 while adjacent `/health/live` and meta requests were V5.8.2. This was recorded as Cloudflare edge propagation, not hidden. No redeploy was performed.

After propagation:

- Six consecutive cache-bypassing rounds returned V5.8.2 and the exact merge SHA from live, ready and meta.
- Three additional final rounds repeated the same result.
- `/api/v1/meta/version` reported `environment:"staging"` and `platform:"cloudflare-workers-d1"`.
- HTTP redirected to HTTPS with 308.
- HSTS, strict CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, referrer policy and permissions policy all passed.

## Exact deployed assets

An isolated offline build was made from the exact merged SHA, not the pre-merge candidate. The published hashed assets matched that build byte-for-byte:

- JavaScript `/assets/index-FXnvntdY.js`: 433,497 bytes; SHA-256 `d79ed1484ce1a2f3ddfe67104c0277e709827faa724c68a73e73d74ab1567dcc`
- CSS `/assets/index-CvszzBVd.css`: 279,005 bytes; SHA-256 `d22de2780d790664961076c7cca688a02b0b378f1a93f2be19a82d97200f9d14`

The exact-merge CodeGraph post-release gate remained up to date at 203 files / 2,385 nodes / 7,807 edges. Markdown and CSS remain explicit non-indexed CodeGraph exceptions, covered by source contracts, the exact-SHA build, online byte comparison, endpoint probes and security-header checks.

## Operational boundary

This evidence change is documentation only. Merging it must not dispatch another deployment. Production remains the deployed SHA above until a separately governed and explicitly approved release occurs.
