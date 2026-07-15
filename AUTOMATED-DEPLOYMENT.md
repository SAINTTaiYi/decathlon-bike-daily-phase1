# Free-stack deployment governance

## Status

Current target architecture:

```text
Browser
  └─ EdgeOne Makers Free project
       ├─ Vite/React static Web
       └─ same-origin Node.js Cloud Functions
            ├─ Supabase Free PostgreSQL
            └─ Supabase Free private Storage

GitHub Free private repository
  ├─ CI / PostgreSQL migration smoke test / Gitleaks
  └─ manually approved migration + deployment-branch promotion
```

Staging and Production use separate EdgeOne projects, separate Supabase projects, separate GitHub Environments, separate secrets, and separate deployment branches. No paid plan, usage-based billing, automatic upgrade, Railway, Cloudflare Pages, or Cloudflare R2 is part of the active design.

No real Supabase or EdgeOne project has been created yet. Production remains forbidden.

## Why deployment uses dedicated branches

An EdgeOne Git-connected project automatically deploys commits pushed to its configured production branch. Pushing every `develop` commit directly would let application code deploy before its database migration was approved.

The release workflows therefore use this order:

```text
validate immutable source
→ install from frozen lockfile
→ workflow policy + tests + typecheck + build
→ checksum-locked Supabase migration
→ ordinary fast-forward push to dedicated EdgeOne branch
→ poll HTTPS Web + /health/ready + /api/v1/meta/version
→ verify exact source SHA, version, environment, and database readiness
```

Branches:

| Environment | Source branch | EdgeOne deployment branch | EdgeOne project |
|---|---|---|---|
| Staging | `develop` | `edgeone-staging` | `bike-ops-staging` |
| Production | `main` | `edgeone-production` | `bike-ops-production` |

Rules:

- Deployment branches contain ordinary repository commits; no generated Secret or state file is committed.
- Promotion is a normal `git push`; force push and history rewriting are forbidden.
- An existing deployment branch must be an ancestor of the requested source SHA. Non-fast-forward promotion fails closed.
- `edgeone-staging` may be created once during Staging bootstrap.
- `edgeone-production` must be pre-created only during an explicitly approved Production bootstrap. The workflow refuses to create it implicitly.
- EdgeOne projects must not auto-deploy `develop` or `main` directly.

## EdgeOne project configuration

Both projects use committed [`edgeone.json`](./edgeone.json):

```json
{
  "installCommand": "corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build:edgeone",
  "outputDirectory": "apps/web/dist",
  "nodeVersion": "22.11.0"
}
```

The EdgeOne build does **not** run migrations or mutate cloud resources. It builds the API function output and static Web only. `scripts/generate-build-metadata.mjs` derives `APP_VERSION` from `package.json` and `GIT_SHA` from the checked-out commit; do not configure stale `APP_VERSION` or `GIT_SHA` overrides in the console.

EdgeOne currently applies project environment variables to all deployments in that project. This is why Staging and Production require separate projects rather than preview/production environments inside one project.

### EdgeOne runtime variables

Configure these in each EdgeOne project with isolated values:

```text
APP_ENV=staging | production
DATABASE_URL=<Supavisor transaction pooler, port 6543, sslmode=require>
DATABASE_POOL_MAX=1
DATABASE_IDLE_TIMEOUT_SECONDS=5
DATABASE_CONNECT_TIMEOUT_SECONDS=15
SESSION_SECRET=<32+ random bytes>
CSRF_SECRET=<32+ random bytes>
PASSWORD_PEPPER=<32+ random bytes>
CONTACT_ENCRYPTION_KEY=<32-byte base64url key>
CORS_ALLOWED_ORIGINS=<exact HTTPS EdgeOne/custom origin>
COOKIE_SECURE=true
COOKIE_DOMAIN=<blank unless a verified custom domain requires it>
SESSION_TTL_HOURS=12
TRUST_PROXY=true
ADMIN_SETUP_TOKEN_HASH=<SHA-256 hex digest of one-time setup token>
SUPABASE_URL=<project API URL>
SUPABASE_SECRET_KEY=<server-only secret key>
SUPABASE_STORAGE_BUCKET=bike-ops-media
VITE_API_BASE_URL=<blank, same-origin>
VITE_ENABLE_SERVICE_WORKER=false
```

Never expose database URLs, application secrets, peppers, contact encryption keys, or `SUPABASE_SECRET_KEY` with a `VITE_` prefix. The Supabase secret key remains server-only and must never be returned to the browser.

## GitHub Environment configuration

### `staging`

Existing environment branch policy: only `develop` may deploy.

Required Secret:

```text
MIGRATION_DATABASE_URL
```

Required non-sensitive Environment variable:

```text
EDGEONE_SITE_URL=https://<staging-domain>
```

`MIGRATION_DATABASE_URL` must be the Staging Supavisor **session pooler** URL on port `5432` with `sslmode=require`. It is used only by the GitHub migration job and must not be configured in EdgeOne.

### `production`

Do not create or configure until Staging acceptance and separate user approval. It requires the same names but Production-only values, plus required reviewers:

```text
Secret: MIGRATION_DATABASE_URL
Variable: EDGEONE_SITE_URL
```

## Database and Storage migration

The repository migration runner:

- reads only `MIGRATION_DATABASE_URL`;
- sorts `supabase/migrations/*.sql` by filename;
- acquires a PostgreSQL advisory lock;
- records filename, SHA-256, and applied time in `public.bike_ops_schema_migrations`;
- rejects any changed migration that was already applied;
- executes each new migration transactionally.

Current migrations create the application schema and, when running inside a real Supabase project, reconcile the private `bike-ops-media` bucket with a 10 MB object limit and JPEG/PNG/WebP allowlist.

Runtime API connections use the Supavisor transaction pooler on port `6543`, `prepare=false`, and a default pool size of one per warm function instance. Migration URLs never enter EdgeOne runtime.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `develop`/`main`:

1. Node 22 and pinned pnpm 9.15.9.
2. Free-stack workflow policy validation.
3. PostgreSQL 16 migration twice, verifying both migration checksums are recorded once.
4. Domain, Database, Web/Ops, and API tests.
5. TypeScript typecheck.
6. Monorepo build and version fingerprint check.
7. Frontend regression checks.
8. Verified Gitleaks 8.30.1 full-history scan with SARIF artifact.

CI has no cloud mutation credential and cannot deploy.

## Staging release

Workflow: `Deploy staging · free stack`.

It is manual only and must be dispatched from `develop` with:

```text
release_sha=<current full remote develop SHA>
confirm_free_plan=true
confirm_no_billing=true
confirm_staging_only=true
```

The job uses the `staging` GitHub Environment and then:

1. verifies `release_sha` is current `origin/develop`;
2. runs workflow governance, all tests, typecheck, and build;
3. validates `MIGRATION_DATABASE_URL` and HTTPS `EDGEONE_SITE_URL`;
4. applies checksum-locked migrations;
5. fast-forwards `edgeone-staging` to the exact SHA;
6. waits for EdgeOne Git Integration;
7. checks Web, database readiness, package version, exact SHA, and `APP_ENV=staging`;
8. uploads a non-sensitive receipt artifact for 30 days.

If migration fails, the deployment branch is not advanced. If EdgeOne fails after migration, the migration remains applied; migrations must therefore remain backward-compatible and follow Expand/Migrate/Contract.

## Production release

Production is manual only and remains disabled until Staging acceptance, encrypted backup implementation, and restore drill completion.

Required inputs:

```text
version
release_sha
staging_accepted_sha
approve_production=true
confirm_encrypted_backup=true
confirm_restore_drill=true
confirm_free_plan=true
confirm_no_billing=true
```

Gates:

- dispatch from `main` only;
- `release_sha` equals current remote `main`;
- package version equals the requested version;
- `staging_accepted_sha` equals current `origin/edgeone-staging`;
- accepted Staging SHA is an ancestor of the Production SHA;
- source trees are identical;
- Production GitHub Environment reviewers approve;
- Production Supabase/EdgeOne projects are confirmed Free with paid/usage billing disabled;
- current encrypted export and successful restore drill are confirmed.

Then the same migration → fast-forward deployment branch → exact release verification sequence runs. The non-sensitive receipt is retained for 90 days.

## Free-tier boundary

### Supabase Free

Operational budget per current project documentation:

- database: 500 MB;
- Storage: 1 GB;
- bandwidth: 10 GB aggregate (5 GB cached + 5 GB uncached);
- inactive Free projects may pause;
- no managed daily backups/PITR suitable for this Production requirement.

At 70% usage, start cleanup/archive planning. At 85%, freeze non-essential attachment uploads and investigate. Do not upgrade automatically. A Free-plan quota notification is an operational incident, not permission to enable billing.

### EdgeOne Makers Free

Current published quotas include 40 projects, 500 builds/month, 1 million Cloud Function executions/month, 3 million Edge Function executions/month, and 5 GB site storage. Quotas and terms may change. Do not enable paid features, usage billing, automatic plan changes, or optional paid add-ons.

## Attachment flow

1. Browser requests `/api/v1/attachments/prepare`.
2. API validates session, store, CSRF, idempotency, permissions, MIME, size, and count.
3. API creates a pending attachment and returns an object-scoped signed upload URL.
4. Browser uploads directly to private Supabase Storage.
5. Browser calls `/api/v1/attachments/complete`.
6. API checks Storage metadata, downloads the object, computes its actual SHA-256, and marks it ready only on an exact match.
7. Viewing uses a short-lived signed download URL.
8. Delete first soft-deletes database visibility, then attempts private-object cleanup.

Limits: JPEG/PNG/WebP, 10 MB per file, six files per business record.

## Backup and rollback boundary

- Free Supabase does not satisfy the Production backup requirement by itself.
- Before Production, implement encrypted `pg_dump` plus a private Storage manifest/export, store it outside the live project, and complete a restore drill.
- Application rollback means fast-forwarding a new revert commit; never rewrite deployment-branch history.
- Database migrations use Expand/Migrate/Contract. Ordinary application rollback does not run destructive down migrations.
- EdgeOne console redeploy must not bypass GitHub migration and release gates.
- There is no automated destroy or Secret-rotation command. Do not claim one-click disaster recovery.

## Network failure rule

If npm, GitHub, EdgeOne, Supabase API, or Supabase PostgreSQL is unreachable from the current network, stop and ask the operator to enable VPN. The network guard does not blindly retry confirmed network-unreachable failures.
