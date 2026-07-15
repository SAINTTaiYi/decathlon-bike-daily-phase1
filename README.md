# Decathlon Bike Ops · Daily Closing Lookbook

A database-backed bike-department closing and cross-day operations workspace. The interface keeps its mobile, black-and-white hard-edge product-lookbook language while a Fastify API, PostgreSQL transactions, real accounts, audit history, concurrency control, and private attachments support multi-user operation.

> This project does not connect to official Decathlon business APIs. Store colleagues enter data manually. PostgreSQL is the business source of truth; the browser keeps only runtime session state, the latest in-memory snapshot, and an optional explicit legacy-v5 import source.

## Current implementation

Completed in code and local verification:

- pnpm monorepo: Web, API, Domain, Contracts, Database.
- Username/password authentication, Argon2id, HttpOnly session, CSRF, login throttling, and forced password change.
- `operator / manager / admin` roles; closing/reopen and legacy import require manager/admin.
- Server business date, revision conflicts, Idempotency-Key, transactional audit, and safe undo.
- Sales, closing, repair, pickup, resale, and handover APIs.
- AES-256-GCM contact encryption and non-persistent pickup-code verification.
- Supabase private Storage attachments with object-scoped signed upload/download URLs, 10 MB and MIME limits, server re-download, actual SHA-256 verification, and database-first soft deletion.
- Vite/React Web synchronization, focus refresh, 45-second polling, offline read-only mode, and session-expiry handling.
- EdgeOne Makers Node.js Cloud Function adapter for the existing Fastify application; no listening socket in Serverless runtime.
- Supavisor transaction-pooler runtime with one connection per warm function instance by default.
- EdgeOne Git Integration governance with checksum-locked Supabase migrations before dedicated deployment-branch promotion.
- CI with PostgreSQL 16 migration smoke tests, tests/typecheck/build, immutable release metadata, and verified Gitleaks full-history scanning.

Current cloud boundary:

- Private GitHub repository has `main`, `develop`, and a branch-restricted `staging` GitHub Environment.
- No real Supabase or EdgeOne project has been created.
- No real cloud Secret is committed or configured by this repository work.
- Staging has not been deployed or accepted.
- Production resources and deployment remain forbidden.

## Product rules

- Saved sales data is the only closing requirement.
- Only manager/admin can close or reopen a day.
- Unchanged repairs, pickups, resale items, and handovers naturally continue across days.
- Store-product repairs finish in the repair module; other completed repairs move to pickup.
- Paid/warranty repairs require the corresponding document status before pickup; free repairs can be picked up directly.
- Pickup codes are validated only in the current request and are never stored or audited.
- Completed/picked-up records are blacked out for the current business day, removed from the active ledger on the next server business day, and retained in audit history.
- Closing locks business writes while preserving historical viewing.

Full product and design sources: [`PRODUCT.md`](./PRODUCT.md) and [`DESIGN.md`](./DESIGN.md).

## Architecture

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite 5 + React 18 static Web
       └─ same-origin Node.js Cloud Functions
            └─ Fastify + TypeScript
                 ├─ Supabase Free PostgreSQL 16
                 └─ Supabase Free private Storage
```

Runtime endpoints:

```text
GET /health/live
GET /health/ready
GET /api/v1/meta/version
```

The version endpoints report package version, checked-out Git SHA, schema version, and runtime environment. Deployment verification rejects stale or wrong-environment releases.

## Repository layout

```text
apps/
  web/                  Vite/React lookbook UI
  api/                  Fastify auth/business/media API + EdgeOne adapter
cloud-functions/        EdgeOne same-origin /api and /health entrypoints
packages/
  domain/               shared business rules
  contracts/            Zod request/response contracts
  database/             PostgreSQL client and checksum migration runner
supabase/
  migrations/           application schema + private Storage bucket
  seed.sql              no users, passwords, contacts, or business data
scripts/ops/            workflow policy, network guard, branch promotion, deploy verification
.github/workflows/      CI and manual Staging/Production free-stack release gates
tests/                  Web, workflow, deployment, and version regression tests
plan/                   execution checkpoints, decisions, and receipts
```

## Requirements

- Node.js 22 (`.nvmrc`)
- pnpm 9.15.9
- PostgreSQL 16 or local Supabase CLI stack

If npm, GitHub, EdgeOne, or Supabase is unreachable from the current network, stop and enable VPN. The network guard intentionally does not blindly retry a confirmed network-unreachable failure.

## Local setup

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Start PostgreSQL/Supabase, fill `.env`, and migrate:

```bash
pnpm --filter @bike-ops/database migrate
```

Start API and Web in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`
- Local Supabase PostgreSQL default: `127.0.0.1:54322`

For local first-run, set `ADMIN_SETUP_TOKEN_HASH` to the SHA-256 of a temporary token and open:

```text
http://127.0.0.1:5173/#setup=<temporary-token>
```

After creating the first administrator, rotate or remove the setup digest through a controlled configuration change. The database user count independently prevents a second initialization.

## Environment variables

See [`.env.example`](./.env.example).

Important boundaries:

- `VITE_*` values may reach the browser.
- Database URLs, Session/CSRF secrets, password pepper, contact encryption key, and `SUPABASE_SECRET_KEY` are server-only.
- EdgeOne uses `DATABASE_URL` with the Supavisor transaction pooler on port 6543.
- GitHub/local migration uses `MIGRATION_DATABASE_URL` with the Supavisor session pooler on port 5432.
- `MIGRATION_DATABASE_URL` must never enter EdgeOne runtime.
- EdgeOne uses an empty `VITE_API_BASE_URL` for same-origin `/api` calls.
- `APP_VERSION` and `GIT_SHA` are generated during build; do not override them with stale console variables.
- CORS origins are explicit; `*` is rejected.

## Verification

```bash
pnpm check:workflows
pnpm test
pnpm typecheck
pnpm build
```

The root test command runs Domain, Database, Web/Ops, and API suites. Build first enforces version consistency and the source/deployment fingerprint, then builds all workspaces.

CI also runs the checksum migration twice against PostgreSQL 16 and verifies both committed migration records.

## Deployment governance

EdgeOne must not deploy `develop` or `main` directly.

| Environment | Source | Dedicated EdgeOne branch |
|---|---|---|
| Staging | `develop` | `edgeone-staging` |
| Production | `main` | `edgeone-production` |

Manual release flow:

```text
immutable SHA + approval checks
→ tests/typecheck/build
→ Supabase checksum migration
→ normal fast-forward push to EdgeOne branch
→ EdgeOne Git Integration deployment
→ Web/API/database/version/SHA/environment verification
```

No force push is allowed. EdgeOne build never mutates the database. Staging and Production use separate Supabase projects, EdgeOne projects, GitHub Environments, and secrets.

Detailed governance: [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md).
Staging bootstrap checklist: [`docs/STAGING-ACCOUNT-SETUP.md`](./docs/STAGING-ACCOUNT-SETUP.md).

## Free-tier constraints

- Supabase Free is a capacity budget, not a Production SLA. Inactive projects may pause.
- Current operating budget: 500 MB database, 1 GB Storage, and 10 GB aggregate bandwidth (5 GB cached + 5 GB uncached).
- EdgeOne Makers Free currently publishes 40 projects, 500 builds/month, 1 million Cloud Function executions/month, 3 million Edge Function executions/month, and 5 GB site storage.
- Paid plans, usage billing, automatic upgrade, and paid add-ons must remain disabled.
- At 70% quota usage, plan cleanup/archive. At 85%, freeze non-essential attachment uploads and investigate.
- Production requires an encrypted external export and successful restore drill; Free Supabase alone does not satisfy this requirement.

## Version governance

Current registered interface version: **V5.2.10**.

Version truth must match across:

- root `package.json`
- `apps/web/package.json`
- `apps/web/src/data/releaseNotes.js`
- `version-manifest.json`

For the next product/deployment change:

```bash
pnpm version:patch -- \
  --title "Update title" \
  --summary "Update summary" \
  --change "Change one" \
  --change "Change two"

pnpm version:stamp
pnpm build
```

The fingerprint includes source, tests, migrations, EdgeOne configuration, workflows, and product/deployment documentation; generated build metadata, dependencies, build output, execution receipts, and real secrets are excluded.

## Security notes

- Never commit `.env`, database URLs/passwords, Supabase secret keys, Session/CSRF secrets, peppers, contact encryption keys, or setup tokens.
- Never expose server secrets through `VITE_` variables.
- Never copy Production data into Staging.
- Never connect EdgeOne directly to `develop` or `main`.
- Never force-push deployment branches.
- Never treat a successful static build as cloud, backup, or recovery validation.
- Never create Production resources before Staging acceptance and separate user approval.

## Staging acceptance still required

Before any Production action, validate on real Staging:

- first-admin setup, login, forced password change, and role boundaries;
- sales/closing, repair, pickup, resale, and handover lifecycles;
- two-device revision conflicts and idempotent retries;
- audit search and safe undo;
- private attachment upload, integrity verification, viewing, expiration, and deletion;
- legacy-v5 preview/import and duplicate handling;
- offline read-only behavior and session expiry;
- Android/iPhone, keyboard, screen reader, 200% zoom, and reduced motion;
- quota monitoring, encrypted export, restore procedure, and rollback boundary.
