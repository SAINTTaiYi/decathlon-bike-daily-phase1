# Cloudflare Staging configuration

## Current state

Staging already exists:

- Worker: `bike-ops-staging`
- Database: isolated Staging D1
- Runtime: Worker + Static Assets + Hono API
- Current canonical domain: `workshop.skin`

This document records names and procedures only. Never place token values, passwords, setup tokens, peppers, or encryption keys in commits, Issues, artifacts, screenshots, or normal chat.

## GitHub `staging` Environment

Required Secret:

```text
CLOUDFLARE_API_TOKEN
```

Required variables:

```text
CLOUDFLARE_ACCOUNT_ID
STAGING_BASE_URL
```

The token should be limited to the account and permissions required to deploy the Staging Worker and apply Staging D1 migrations. Do not reuse it for unrelated accounts.

The Environment branch policy must permit `feature/cloudflare-workers-d1`, `develop`, and `main`, because the canonical workflow validates the selected remote branch head before deployment.

## Worker secrets

Configure isolated Staging values directly on `bike-ops-staging`:

```text
SESSION_SECRET
CSRF_SECRET
PASSWORD_PEPPER
CONTACT_ENCRYPTION_KEY
PLATFORM_ADMIN_SETUP_TOKEN_HASH or ADMIN_SETUP_TOKEN_HASH when initialization is required
REGISTRATION_SECRET when self-registration is enabled
RESEND_API_KEY when email OTP is enabled
RESEND_FROM when email OTP is enabled
```

Do not store secret values in `wrangler.jsonc`. `APP_VERSION`, `GIT_SHA`, `APP_ENV`, CORS, Cookie security, and the D1 binding are generated or set by the deployment workflow.

## Release

Dispatch `Deploy Cloudflare staging · free stack` from the branch whose head you are deploying:

```text
release_sha=<exact current full remote branch SHA>
confirm_free_plan=true
confirm_no_billing=true
confirm_staging_only=true
```

The workflow runs policy validation, all tests, typecheck, build, D1 migrations, Worker deployment, and exact live identity verification.

## Manual acceptance

Verify the deployed SHA first, then test:

- login and logout;
- first-login and self-service password changes;
- registration OTP when enabled;
- store directory and role governance;
- sales save and closing gates;
- repair completion and transfer to pickup;
- all pickup sources and pickup confirmation;
- audit history and safe undo;
- offline/read-only behavior;
- mobile and desktop layouts.

Record the exact accepted SHA. Production must use an identical source tree.

## Boundaries

- Staging remains on the Cloudflare Free plan.
- Paid plans, usage billing, and automatic upgrades stay disabled.
- The active Cloudflare runtime does not provide attachments; attachment API routes return `410 MEDIA_DISABLED`.
- Do not create or mutate Production resources as part of a Staging release.
- Do not use the retired EdgeOne workflow.
