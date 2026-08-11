# Cloudflare Workers + D1 Migration

**Status:** in progress on `feature/cloudflare-workers-d1`  
**Date:** 2026-07-17  
**Constraint:** Free/no-card only · Production forbidden · Secrets never in chat/repo/logs

## Target architecture

| Layer | Choice |
|---|---|
| Source / CI | GitHub |
| Runtime | One Cloudflare Worker (`bike-ops-staging`) |
| Web | Workers Static Assets (`apps/web/dist`) |
| API | Hono on Workers (`apps/worker`) |
| Database | Cloudflare D1 (`bike-ops-staging`) |
| File storage | **None** (product has no image/file requirement) |

**Out of target architecture:** EdgeOne, Supabase, Supabase Storage, R2.

## Cloudflare resources created

| Resource | Name | ID | Notes |
|---|---|---|---|
| D1 | `bike-ops-staging` | `91e78387-9b24-4126-a5a1-27f9c1792975` | Free, APAC; schema `0001_initial_sqlite` applied (sha256 `bfecb5d0…3644d`) |
| Worker | `bike-ops-staging` | (not deployed yet) | Will bind D1 + assets |

Existing Supabase (`xrxmayzwxabmzanwhkmo`) and EdgeOne project remain **untouched** until this path is verified.

## Why a rewrite (not a lift-and-shift)

1. **Postgres → SQLite/D1:** `jsonb`, `uuid`, `timestamptz`, `interval`, advisory locks, schemas, and `postgres.js` cannot run on D1.
2. **Node-native deps:** `@node-rs/argon2` is replaced with WebCrypto PBKDF2-SHA-256.
3. **EdgeOne inject adapter** (`apps/api/src/edgeone.ts` / Fastify `inject`) is replaced by native Hono fetch handlers.
4. **Attachments / Supabase Storage** are removed from the Cloudflare product path (`410 MEDIA_DISABLED`).

## Parallel-path policy

- Old Fastify API, Supabase migrations, EdgeOne workflows stay on `develop` until cutover.
- New code lives under:
  - `apps/worker/**`
  - `migrations/d1/**`
  - `wrangler.jsonc`
  - `plan/CLOUDFLARE-WORKERS-D1-MIGRATION.md`
- No deletion of Supabase/EdgeOne resources in this phase.

## Completed

- [x] Architecture decision archived
- [x] D1 staging database created (Free)
- [x] Feature branch `feature/cloudflare-workers-d1`
- [x] SQLite schema `migrations/d1/0001_initial_sqlite.sql` (no attachments table)
- [x] Schema applied to remote D1 staging (15 app tables + indexes)
- [x] Worker scaffold: env, db helpers, WebCrypto password/contact crypto, auth middleware, health + auth routes
- [x] `wrangler.jsonc` with Static Assets + D1 binding + `run_worker_first` for `/api/*` and `/health/*`

## Phase B (API port)

- [x] Idempotency helper for D1
- [x] Closing / KPI routes
- [x] Work-items CRUD + actions (repair/pickup/resale/handover)
- [x] Audit list + undo
- [x] Bootstrap aggregate
- [ ] Legacy local import (optional, deferred)
- [ ] Install hono deps + typecheck
- [ ] Deploy staging Worker with secrets

## Phase C (build + bootstrap deploy)

- [x] Install `hono` + workers-types (workspace)
- [x] Worker typecheck passes
- [x] esbuild bundle `dist/worker/index.js` (~256KB; Android cannot run workerd/wrangler)
- [x] Web production build `apps/web/dist`
- [x] Offline secrets generated in Termux private dir `~/.bike-ops-staging-secrets/` (mode 600; never in repo/chat)
- [x] Bootstrap Worker deployed: `bike-ops-staging` on workers.dev subdomain `geeklightonefish`
- [x] Smoke: `/health/live`, `/health/ready` (D1), `/api/v1/meta/version`
- [ ] Upload full Hono API bundle (needs deploy path without putting secrets in chat)
- [ ] Attach static assets + set CORS to workers.dev origin
- [ ] Put Worker secrets via dashboard / wrangler on a supported host
- [ ] Full smoke: setup → login → bootstrap → work-item

**Staging URL (bootstrap):** `https://bike-ops-staging.geeklightonefish.workers.dev`

## Next queue (ordered)

1. ~~Apply D1 migration~~ done.
2. Install `hono` + `@cloudflare/workers-types` in workspace; ensure `pnpm` resolves `@bike-ops/worker`.
3. ~~Port remaining Fastify routes~~ core routes done; legacy import deferred.
4. Wire deploy workflow `Deploy staging · Cloudflare free stack` (replace EdgeOne/Supabase steps; keep free-plan confirmations).
5. Generate Worker secrets offline; set via dashboard / `wrangler secret put` (never chat/repo).
6. Build web, deploy Worker, set `CORS_ALLOWED_ORIGINS` to real `*.workers.dev` URL.
7. Smoke: `/health/ready`, admin setup, login, bootstrap, one work-item CRUD.
8. Only after verification: schedule decommission of Supabase/EdgeOne (explicit user authorization).

## Secret inventory (names only)

| Name | Purpose |
|---|---|
| `SESSION_SECRET` | Session cookie HMAC |
| `CSRF_SECRET` | CSRF token HMAC |
| `PASSWORD_PEPPER` | Password pepper |
| `CONTACT_ENCRYPTION_KEY` | AES-GCM contact field key (base64url 32 bytes) |
| `ADMIN_SETUP_TOKEN_HASH` | SHA-256 of one-time setup token |

## Free-plan limits to respect

- Workers Free: 100k req/day, 10 ms CPU/invocation, 3 MB worker size
- D1 Free: 5M rows read/day, 100k rows written/day, 5 GB storage
- No paid upgrades, no card

## Non-goals this phase

- Production Worker / Production D1
- Data migration from Supabase Postgres (fresh staging schema first)
- Image upload / R2
- Deleting existing Supabase or EdgeOne projects
