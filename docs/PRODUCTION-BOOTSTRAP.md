# Cloudflare Production bootstrap

Production bootstrap is a separately approved operation. The release workflow will not create resources implicitly.

## Preconditions

- The exact current `main` SHA has passed Cloudflare Staging.
- Manual Staging acceptance is recorded for that SHA.
- Cloudflare Workers and D1 remain on the Free plan.
- Paid plans, usage billing, and automatic upgrades are disabled.
- Production secrets are generated independently from Preview and Staging.
- A secure location outside the live Cloudflare account is available for encrypted D1 exports.

## Resources

Create exactly:

```text
Worker: bike-ops-production
D1: bike-ops-production
```

Do not attach `workshop.skin` yet. Use the Production Worker's separate `workers.dev` URL for bootstrap verification.

## Production secrets

Set isolated values on `bike-ops-production`:

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

Never copy secret values from Staging.

## GitHub `production` Environment

Configure required reviewer approval and branch policy for `main` only.

Secret:

```text
CLOUDFLARE_API_TOKEN
```

Variables:

```text
CLOUDFLARE_ACCOUNT_ID
PRODUCTION_BASE_URL
PRODUCTION_D1_DATABASE_ID
```

`PRODUCTION_BASE_URL` initially points to the verified Production `workers.dev` URL. The workflow requires the Worker and D1 to exist before any migration.

## Database bootstrap and recovery evidence

Before the first Production release:

1. prepare an encrypted export procedure;
2. prove decryption in an isolated environment;
3. import into a disposable D1 database;
4. verify schema and representative data;
5. record the restore result without recording secrets or private data.

For a new empty Production database, preserve an encrypted post-migration export and complete the same restore drill before declaring the backup gate satisfied.

## Release

Dispatch `Deploy Cloudflare production · free stack` from `main` only after all inputs can truthfully be confirmed. The workflow validates the exact release and accepted Staging trees, preflights both Cloudflare resources, applies D1 migrations, deploys the Worker and Static Assets, then verifies version, SHA, environment, readiness, and HTML.

## Domain cutover

After Production passes on its independent URL:

1. attach `workshop.skin` to `bike-ops-production`;
2. attach or redirect `www.workshop.skin` according to the approved domain policy;
3. verify `/health/live`, `/health/ready`, `/api/v1/meta/version`, and `/` on both hosts;
4. confirm `environment=production` and the accepted release SHA;
5. keep the Staging Worker on its separate Staging URL.

Domain cutover is not part of bootstrap and requires separate approval.
