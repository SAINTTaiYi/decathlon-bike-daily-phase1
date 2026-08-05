# Workshop V5.8.5 → V5.8.3 Production Rollback Evidence

**Date:** 2026-08-05 22:44 +08:00 · **Scope:** runtime-only rollback, no Git history mutation, no D1 write

## What happened

The user reported that the V5.8.5 responsive desktop workbench still did not fit the
overview module on their current browser window and explicitly asked to restore the
previous stable layout. After confirming scope, Production `workshop.skin` was exactly
rolled back from V5.8.5 to the previous formal release V5.8.3 using the Cloudflare
native Worker version rollback mechanism. **Preview was skipped per explicit user
instruction.**

## Exact identities

| Item | V5.8.5 (from) | V5.8.3 (to) |
| --- | --- | --- |
| Git SHA | `d2c47c7fb1bbd41d3d7ddbc56a9174e0d4c9d96a` | `3ec28a321b1f1f02a28a0e4d94abb1be1432065b` |
| Worker version | `6e35e15a-3749-477d-b71b-d8358217f9d0` | `ffccee80-ad9b-446c-99f2-68a9b4093e79` |
| Deployment | `58f2dbfd-4231-4999-90c2-d26e3a1ee77c` | `516c22c7-cd3d-4832-a81b-acf20df99cbd` (100%) |

Scope: Cloudflare Worker code, static assets, and versioned configuration only.
Git history and version-manifest bookkeeping were **not** mutated; V5.8.5 remains in
Git history and is not scheduled for redeploy.

## Database safety

D1 `bike-ops-staging` (`91e78387-…`) was **not** restored, migrated, or written by the
rollback; its binding remained unchanged. A fresh official read-only `/export` was taken
immediately before rollback, restored into an isolated SQLite drill (integrity ok,
0 foreign-key violations, 23 tables, 762 rows), encrypted with AES-256-GCM, round-trip
verified, and the plaintext removed.

- Receipt: `~/.local/share/rikkahub-resilience/workshop-backups/pre-v585-rollback-20260805/pre-v585-rollback-d1-backup-receipt.json`
- Encrypted export: `…/pre-v585-rollback-d1-export-20260805.sql.aes256gcm`
- Rollback receipt: `~/.local/share/rikkahub-resilience/V585-TO-V583-PRODUCTION-ROLLBACK-20260805.json`

## Online verification

After a short transient mixed-edge window during propagation (same pattern as the
previous V5.8.4→V5.8.3 rollback), the converge probe recorded **3 consecutive exact
rounds** on both `workshop.skin` and `bike-ops-staging.geeklightonefish.workers.dev`;
each round checked `/health/live`, `/health/ready`, and `/api/v1/meta/version` and all
returned `5.8.3` + exact SHA `3ec28a3…`.

- HTTP `http://workshop.skin` → 308 Permanent Redirect to HTTPS
- Security headers pass: HSTS, strict CSP (`frame-ancestors 'none'`), X-Frame-Options
  DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy
- Deployed assets byte-identical to the previously verified V5.8.3 build:
  - JS `/assets/index-BV3068vH.js` SHA-256 `000d82e0f359132729b43f5fe1833baf8dbe7a963e603058d3464114d6e90802`
  - CSS `/assets/index-CV36aH6k.css` SHA-256 `3a9948ec48afc37d9de88f1b388568c72979a2bcdb9360071ff528424e4bd1a5`

## CodeGraph

Pre-change index was already up to date (208 files / 2,443 nodes / 7,907 edges);
post-change `sync` reports "Already up to date". No source files changed by this
runtime-only rollback, so the same index remains valid.

## Documentation-only PR

This file is the only change in this PR. No workflow, source, version, D1, or
deployment change is included; the docs merge must not trigger any deployment.
