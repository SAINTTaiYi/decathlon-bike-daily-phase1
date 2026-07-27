# V5.7.9 formal release evidence · workshop.skin

Released: 2026-07-28 07:18 +08:00 (Asia/Shanghai)
Status: released to the live business site and independently verified. All live D1 business data preserved.

## Release identity

- Public version: V5.7.9 · 门店治理、安全加固与维修取车闭环
- Exclusive Preview baseline: `dabe0ed8d1ba662840460837c88bf288fb3ffaaa`
- Accepted Preview/admin source: `09093400daa2ca798f2b6e11fce8082f66d1780a`
- Formal release candidate: `e7b35657de2c0bada7b0fa723809854439813259`
- Merge commit deployed: `7942a450025b9ca1f58b11a0c56ea4ee9756765b`
- Release PR: #74 (`release/v5.7.9-workshop-skin` → `feature/cloudflare-workers-d1`), ordinary merge; no squash, rebase, or force push.
- Candidate touched only the five governed release paths: root/web `package.json`, `apps/web/src/data/releaseNotes.js`, `formal-release.json`, `version-manifest.json`.

## Pre-release gates

| Gate | Result |
| --- | --- |
| Tests | 174 passing, 0 failing (108 root, 21 API, 28 Worker, 17 domain/database) |
| Typecheck | all packages pass |
| Workflow policy | 88 policies pass |
| Build | Web 461 kB JS / 209 kB CSS; API compiled |
| Frozen offline install | pass, 102 packages fully reused |
| Version gate (standard) | `VERSION OK · V5.7.9 · 10 项更新 · 351 files · formal` |
| Version gate (production) | `VERSION OK · V5.7.9 · 10 项更新 · 351 files · production-ready` |
| CodeGraph 1.5.0 | 183 files / 2,199 nodes / 7,530 edges, current |
| CI (PR #74) | `secrets` and `verify` both success |

## Live D1 backup and restore drill

Performed before deployment against the live database `bike-ops-staging` / `91e78387-9b24-4126-a5a1-27f9c1792975`.

- Snapshot bookmark: `000000d7-00000000-000050b5-84bfc78cafd0d584b63f66cc94599921`
- Read-only official `/export`; no mutation, migration, or deployment during backup
- SQL SHA-256: `64e1d9b2df8425bd99841a06605be7b2fc822f5f1f701beee5ce98c03b469978`
- Isolated SQLite restore drill: `integrity_check` = ok, `foreign_key_check` = 0 violations
- Baseline content: 18 tables, 535 rows, 5 migrations
- Encrypted at rest with AES-256-GCM; encrypted SHA-256 `5fe6b77f39da465a84ffbb253a4c63404d73b6ad9bd7771d138583bb6a950c18`
- Decrypt round-trip verified; plaintext removed; stored device-local only, never uploaded to any third party

## Deployment

- Workflow: `Deploy Cloudflare staging · free stack`, run `30313628945`, dispatched on the exact merged SHA
- Confirmations: free plan, no billing, staging-only
- Every step succeeded, including `Apply Staging D1 migrations` and the built-in identity verification
- Cloudflare Deployment: `0bb3a18e-8694-4b62-8648-ebe971acccea`
- Worker Version: `4b86b487-a425-4755-a4fc-4b24e0aa6ae0` at 100%
- Superseded: Deployment `d6fb2477-a2a6-4693-93de-c057084f70b6`, Version `0112358e-52bd-45d7-b8b7-09b8b323612e` (V5.7.8)

## Independent live verification

Health and identity endpoints are `/health/live`, `/health/ready`, `/api/v1/meta/version`. There is no `/api/ready` or `/api/meta`; unknown non-API paths intentionally fall through to the static Web shell.

- `/health/live` → `{"status":"ok","version":"5.7.9","gitSha":"7942a450025b9ca1f58b11a0c56ea4ee9756765b"}`
- `/health/ready` → `{"status":"ready","version":"5.7.9","gitSha":"7942a450025b9ca1f58b11a0c56ea4ee9756765b"}`
- `/api/v1/meta/version` → appVersion `5.7.9`, apiVersion `1.0.0`, schemaVersion `0002_work_item_ticket_numbers`, environment `staging`, platform `cloudflare-workers-d1`
- `/` → HTTP 200 HTML
- Web headers: HSTS `max-age=31536000`, strict CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`
- API headers: `Cache-Control: no-store, private`, CSP `default-src 'none'`
- `http://workshop.skin/` → HTTP 308 to `https://workshop.skin/`

## Post-deployment D1 integrity — no data loss

Post-deployment export compared against the pre-deployment encrypted backup.

- Post-deploy bookmark: `000000d8-00000006-000050b5-cf855ad7ad489ee8e2c683b1941f266a`
- Tables 18 → 23; total rows 535 → 543; migrations 5 → 7
- Migrations applied: `0006_store_directory_self_registration.sql`, `0007_repair_completion_statuses.sql`
- Tables added by migration: `cities`, `regions`, `registration_challenges`, `role_change_requests`, `store_transfer_requests`
- `stores` 1 → 5 from the store-directory seed
- **Zero tables removed. Zero row-count regressions.**
- Post-deploy `integrity_check` = ok, `foreign_key_check` = 0 violations

## Notes for future operations

- The live business site `workshop.skin` retains the historical technical label `staging` for its Cloudflare Worker, D1 database, and GitHub Environment. This is intentional; do not rename it or create a second Production stack.
- The `staging` and `preview` GitHub Environment Cloudflare tokens lack D1 SQL permission (`SQLITE_AUTH`), so Actions-based D1 backup is not currently possible. Backups were taken through a credential that can read D1 directly.
- D1 `/query` can return intermittent `SQLITE_AUTH`; the official `/export` endpoint proved reliable and is preferred for verification.
- Compound `SELECT ... UNION ALL` over all tables exceeds D1's compound-select term limit; batch such queries.

## Scope of this document

Documentation only. No source, configuration, workflow, or infrastructure change. No second deployment is triggered by merging this evidence.
