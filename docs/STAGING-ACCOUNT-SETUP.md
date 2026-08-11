# Free Staging account and Secret setup

Target: connect `SAINTTaiYi/decathlon-bike-daily-phase1` to one Supabase Free Staging project and one EdgeOne Makers Free Staging project without a paid plan, foreign credit card, usage billing, or automatic upgrade.

> This document records names and procedures only. Never place a real token, password, database URL, one-time setup token, or encryption key in Markdown, normal chat, commits, Issues, logs, screenshots, or artifacts.

## Current gate

Do not execute this checklist until code Steps 12–15 are complete.

Before creating the Supabase project, the operator must be told the current quoted project cost is **0 yuan/month** and must confirm the region. Recommended region: Singapore (`ap-southeast-1`) unless the operator chooses another supported region after considering store latency.

Production project creation is forbidden.

## 1. Security preparation

- [ ] Enable MFA on GitHub, Supabase, and EdgeOne accounts.
- [ ] Store recovery codes in a password manager.
- [ ] Confirm the Supabase Organization remains on Free.
- [ ] Confirm the EdgeOne Makers account/project remains on Free.
- [ ] Do not add a payment method merely to raise a quota.
- [ ] Do not enable a paid plan, usage-based billing, automatic upgrade, paid add-on, or optional paid database compute.
- [ ] Keep Staging values isolated from any future Production values.
- [ ] If GitHub, Supabase, EdgeOne, or npm is unreachable, stop and enable VPN; do not blindly retry.

## 2. Create the Supabase Free Staging project

Only after the explicit 0-yuan/month and region confirmation:

```text
Organization: SAINTTaiYi's Org
Project name: bike-ops-staging
Plan: Free
Region: confirmed by user (recommended Singapore)
Database password: unique high-entropy value stored only in password manager
```

After creation:

- [ ] Confirm the project is healthy.
- [ ] Confirm Organization/project billing still shows Free.
- [ ] Confirm no paid compute or add-on is enabled.
- [ ] Record the project ref and region in the password-manager entry; they are non-secret but should not be scattered across chat.

## 3. Collect Supabase runtime values

From Project Settings / API and Database / Connect, collect:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
DATABASE_URL
MIGRATION_DATABASE_URL
```

Boundaries:

- `SUPABASE_SECRET_KEY`: server-only project secret key; never use a browser-exposed `VITE_` name.
- `DATABASE_URL`: Supavisor transaction pooler, port `6543`, `sslmode=require`; EdgeOne runtime only.
- `MIGRATION_DATABASE_URL`: Supavisor session pooler, port `5432`, `sslmode=require`; GitHub migration job only.
- Do not use the IPv6-only direct database host from a GitHub-hosted runner.
- Do not configure `MIGRATION_DATABASE_URL` in EdgeOne.

## 4. Generate application secrets

Create a password-manager item `Bike Ops / Staging` and generate unique values:

```text
SESSION_SECRET              32+ random bytes
CSRF_SECRET                 32+ random bytes, different from SESSION_SECRET
PASSWORD_PEPPER             32+ random bytes
CONTACT_ENCRYPTION_KEY      exactly 32 bytes encoded as base64url
INITIAL_ADMIN_SETUP_TOKEN   32+ random bytes, one-time operator value
```

Generate only the SHA-256 hex digest of the one-time setup token for EdgeOne:

```bash
printf '%s' '<INITIAL_ADMIN_SETUP_TOKEN>' | sha256sum
```

Configure the digest as `ADMIN_SETUP_TOKEN_HASH`. Keep the plain one-time token in the password manager; never paste it into normal chat or repository files.

## 5. Configure GitHub `staging` Environment for database bootstrap

The existing `staging` Environment is restricted to `develop`.

Add exactly one Environment Secret:

```text
MIGRATION_DATABASE_URL
```

Leave `EDGEONE_SITE_URL` unset until the EdgeOne project has assigned its HTTPS domain. Do not copy EdgeOne runtime secrets into GitHub.

## 6. Apply the database-only bootstrap

Before any EdgeOne project can deploy a function, run the manual workflow from `develop` with deployment disabled:

```text
Workflow: Deploy staging · free stack
release_sha=<current full remote develop SHA>
confirm_free_plan=true
confirm_no_billing=true
confirm_staging_only=true
database_only_bootstrap=true
```

The job runs workflow governance, all tests, typecheck, and build, then applies the checksum-locked schema and private Storage migration. It does **not** push a deployment branch or require `EDGEONE_SITE_URL`.

Confirm in Supabase Storage:

```text
Bucket: bike-ops-media
Public: false
File size limit: 10 MB
Allowed MIME: image/jpeg, image/png, image/webp
```

Do not add a public read policy.

## 7. Prepare the Staging deployment branch

After database bootstrap passes, create the dedicated deployment branch with an ordinary push:

```bash
git fetch origin develop
git push origin <accepted-develop-sha>:refs/heads/edgeone-staging
```

Rules:

- No force push.
- `edgeone-staging` must only move forward to an ancestor-compatible accepted `develop` SHA.
- Do not connect EdgeOne directly to `develop`.
- Create the branch before the EdgeOne project so the first push itself cannot deploy anything.

## 8. Create and configure the EdgeOne Makers Free Staging project

Import the private GitHub repository into EdgeOne Makers:

```text
Project name: bike-ops-staging
Git repository: SAINTTaiYi/decathlon-bike-daily-phase1
Production branch: edgeone-staging
Plan/edition: Free
Root directory: repository root
Configuration: committed edgeone.json
```

During project setup, configure these isolated Staging variables before starting the initial deployment:

```text
APP_ENV=staging
DATABASE_URL=<Staging transaction pooler URL>
DATABASE_POOL_MAX=1
DATABASE_IDLE_TIMEOUT_SECONDS=5
DATABASE_CONNECT_TIMEOUT_SECONDS=15
SESSION_SECRET=<Staging only>
CSRF_SECRET=<Staging only>
PASSWORD_PEPPER=<Staging only>
CONTACT_ENCRYPTION_KEY=<Staging only>
CORS_ALLOWED_ORIGINS=https://<exact-staging-domain>
COOKIE_SECURE=true
COOKIE_DOMAIN=
SESSION_TTL_HOURS=12
TRUST_PROXY=true
ADMIN_SETUP_TOKEN_HASH=<SHA-256 hex only>
SUPABASE_URL=<Staging project URL>
SUPABASE_SECRET_KEY=<Staging server-only secret key>
SUPABASE_STORAGE_BUCKET=bike-ops-media
VITE_API_BASE_URL=
VITE_ENABLE_SERVICE_WORKER=false
```

Do **not** add `MIGRATION_DATABASE_URL`, `APP_VERSION`, or `GIT_SHA` to EdgeOne. Build metadata is generated from the checked-out source. EdgeOne currently applies project variables across that project, so never reuse this project for Production.

Also confirm:

- [ ] Automatic preview-branch deployment is disabled or restricted so feature branches cannot receive Staging secrets.
- [ ] `develop` and `main` are not production branches.
- [ ] No paid add-on or usage billing is enabled.
- [ ] The build reads `edgeone.json` and uses Node 22.11.0 / pnpm 9.15.9.

## 9. Register the deployed URL and run full verification

After EdgeOne assigns the HTTPS domain, add the non-sensitive GitHub Environment variable:

```text
EDGEONE_SITE_URL=https://<exact-staging-domain>
```

Run the workflow again:

```text
release_sha=<same current full remote develop SHA>
confirm_free_plan=true
confirm_no_billing=true
confirm_staging_only=true
database_only_bootstrap=false
```

The workflow reapplies migrations idempotently, fast-forwards `edgeone-staging` if needed, and verifies Web, API, database readiness, version, exact Git SHA, and `APP_ENV=staging`. The server then issues object-scoped signed upload/download URLs; the private Storage secret never enters the browser.

## 10. Initial administrator

After the deployment receipt passes, open the Staging setup link using the plain one-time token from the password manager:

```text
https://<staging-domain>/#setup=<INITIAL_ADMIN_SETUP_TOKEN>
```

Create the first administrator and store. Then:

1. verify a second setup attempt is rejected;
2. generate a new unrecoverable random value;
3. replace EdgeOne `ADMIN_SETUP_TOKEN_HASH` with the new value's digest or remove it through a controlled configuration change after confirming the application behavior;
4. trigger an approved redeployment;
5. never reuse the original token.

## 11. Free-tier monitoring

Check at least weekly during Staging:

- Supabase database size;
- Supabase Storage size;
- cached and uncached bandwidth;
- EdgeOne build count;
- EdgeOne Cloud Function invocations;
- failed builds, error rates, and project pause state.

Thresholds:

- 70%: create cleanup/archive plan.
- 85%: freeze non-essential attachment uploads and investigate.
- 100%/quota warning: treat as an incident; do not enable billing automatically.

Free Supabase may pause inactive projects. A paused project is not data loss, but it is downtime and must be restored from the dashboard before Staging use.

## 12. Completion report

When configuration is complete, report only names/statuses, never values. Example:

```text
Supabase Staging Free project created in <region>; EdgeOne Staging Free project connected to edgeone-staging; GitHub staging Environment has MIGRATION_DATABASE_URL and EDGEONE_SITE_URL; no paid plan or automatic billing enabled.
```

## Forbidden actions

- Do not paste secrets into normal chat.
- Do not commit `.env`, database URLs, Supabase secret keys, peppers, encryption keys, or setup tokens.
- Do not expose server secrets via `VITE_` variables.
- Do not connect EdgeOne directly to `develop` or `main`.
- Do not force-push deployment branches.
- Do not run migration inside EdgeOne build.
- Do not use one EdgeOne or Supabase project for both environments.
- Do not create Production resources before Staging acceptance and separate user approval.
- Do not claim Free Supabase includes the encrypted, tested Production backup required by this project.
