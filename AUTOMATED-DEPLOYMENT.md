# Cloudflare deployment governance

## Current status

The canonical runtime is:

```text
Browser
  -> Cloudflare Worker
       -> Workers Static Assets (Vite/React)
       -> Hono API routes
       -> Cloudflare D1
```

Current resources:

- `bike-ops-preview` Worker and an isolated Preview D1 exist.
- `bike-ops-staging` Worker and an isolated Staging D1 exist.
- `workshop.skin` currently serves the Staging environment.
- No `bike-ops-production` Worker or Production D1 exists yet.
- Production release is blocked until Staging accepts the exact `main` SHA, an encrypted D1 export exists, and a restore drill succeeds.

The old EdgeOne/Supabase deployment files are retained only for historical compatibility and migration tests. They are not an active deployment path. The two legacy GitHub workflows are inert and fail immediately.

## Environments

| Environment | Worker | Database | GitHub Environment | Status |
| --- | --- | --- | --- | --- |
| Preview | `bike-ops-preview` | isolated Preview D1 | `preview` | available |
| Staging | `bike-ops-staging` | isolated Staging D1 | `staging` | available |
| Production | `bike-ops-production` | isolated Production D1 | `production` | not created |

Every environment must use different application secrets. Never reuse Session, CSRF, password-pepper, contact-encryption, registration, Resend, or setup-token values between environments.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `develop` and `main`:

1. install the pinned pnpm version from the frozen lockfile;
2. validate workflow policy;
3. record a Preview source fingerprint without changing the public version;
4. run the PostgreSQL compatibility migration smoke test twice;
5. run all domain, database, Web, API, and Worker tests;
6. run TypeScript checks and the production build;
7. scan complete Git history with pinned Gitleaks.

CI has no cloud mutation credential.

## Preview release

Workflow: `Deploy Cloudflare preview · free stack`.

It is manual and accepts only the current full SHA of an approved Preview source branch. The workflow validates, builds, applies D1 migrations, deploys Worker plus Static Assets, and verifies the exact version, SHA, environment, database readiness, and Web shell.

Preview never changes the public version by itself.

## Staging release

Workflow: `Deploy Cloudflare staging · free stack`.

Allowed source branches are `feature/cloudflare-workers-d1`, `develop`, and `main`. The selected SHA must equal the remote head of the branch used to dispatch the workflow.

Required GitHub `staging` configuration:

```text
Secret: CLOUDFLARE_API_TOKEN
Variable: CLOUDFLARE_ACCOUNT_ID
Variable: STAGING_BASE_URL
```

Release order:

```text
immutable source check
-> frozen install
-> workflow policy + tests + typecheck + build
-> minified Worker bundle
-> D1 migrations
-> Worker + Static Assets deployment
-> live/ready/meta/Web identity verification
```

For Production preparation, deploy the current `main` SHA to Staging and record that exact SHA after manual acceptance.

## Production bootstrap

Production resources are deliberately not created by the release workflow. Follow [`docs/PRODUCTION-BOOTSTRAP.md`](./docs/PRODUCTION-BOOTSTRAP.md) after explicit approval.

Required GitHub `production` configuration after bootstrap:

```text
Secret: CLOUDFLARE_API_TOKEN
Variable: CLOUDFLARE_ACCOUNT_ID
Variable: PRODUCTION_BASE_URL
Variable: PRODUCTION_D1_DATABASE_ID
```

The Production Worker must already be named `bike-ops-production`; the D1 database must already be named `bike-ops-production`. The workflow verifies both resources through the Cloudflare API before any migration.

## Production release

Workflow: `Deploy Cloudflare production · free stack`.

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
confirm_aggregated_preview_announcement=true
```

Gates:

- dispatch from `main` only;
- `release_sha` equals current remote `main`;
- package version and formal release manifest agree;
- accepted Staging SHA is an ancestor of the Production SHA;
- source trees are identical;
- Production Worker and D1 already exist;
- GitHub `production` Environment approval passes;
- Free-plan and no-billing confirmations pass;
- an encrypted D1 export exists outside Cloudflare;
- that export passed a restore drill.

The workflow then applies Production D1 migrations, deploys the Worker and Static Assets, and verifies the exact version, SHA, `APP_ENV=production`, readiness, and HTML shell.

## D1 migration identity

Wrangler records applied migrations in D1's `d1_migrations` table. The public `/api/v1/meta/version` schema identity is tied to the latest committed file in `migrations/d1`; a test fails if a new migration is added without updating the runtime constant.

Deployment logs remain the authoritative evidence that a remote migration actually ran.

## Backup and restore

Before Production:

1. export the Production D1 database as SQL;
2. encrypt the export before storing it outside the live Cloudflare account;
3. import it into a disposable isolated D1 database;
4. verify the schema, representative row counts, authentication boundaries, and application readiness;
5. delete the disposable database only after explicit confirmation.

Never claim a backup is usable until the restore drill has passed.

## Attachments

The active Cloudflare Worker returns `410 MEDIA_DISABLED` for attachment routes. The legacy Fastify/Supabase implementation and tests remain in the repository for compatibility, but Supabase Storage is not part of the current runtime.

## Domain cutover

`workshop.skin` currently points to Staging. Do not move it during bootstrap. Cut it over only after the Production Worker has passed verification on its separate `workers.dev` URL. Verify apex and `www` independently after the change.

## Rollback

- Application rollback uses a new revert commit and another approved deployment; do not rewrite Git history.
- D1 migrations are forward-only. Do not run destructive down migrations during application rollback.
- Use D1 Time Travel or a tested encrypted export only under a separately approved recovery procedure.
- Never force-push deployment branches.
