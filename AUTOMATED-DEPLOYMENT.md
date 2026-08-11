# Cloudflare deployment governance

## Current status

```text
Browser
  -> Cloudflare Worker
       -> Workers Static Assets (Vite/React)
       -> Hono API routes
       -> Cloudflare D1
```

- Preview and Staging use separate Workers and D1 databases.
- `workshop.skin` currently serves `APP_ENV=staging`.
- No Production Worker or Production D1 exists yet.
- The old EdgeOne/Supabase deployment path is retired; its two workflows are inert audit markers.

## Canonical workflows

- `ci.yml`: policy, tests, typecheck, build, and Gitleaks.
- `deploy-cloudflare-preview.yml`: manual isolated Preview release.
- `deploy-cloudflare-staging.yml`: manual Staging release from an exact branch-head SHA.
- `deploy-production.yml`: manual Production release after bootstrap and all gates.

## Staging

GitHub `staging` requires:

```text
Secret: CLOUDFLARE_API_TOKEN
Variables: CLOUDFLARE_ACCOUNT_ID, STAGING_BASE_URL
```

The workflow validates, builds, applies D1 migrations, deploys the Worker and Static Assets, then verifies version, SHA, environment, readiness, and Web shell. Production preparation requires the exact current `main` SHA to be deployed and manually accepted on Staging.

## Production bootstrap

The release workflow never creates cloud resources. Follow [`docs/PRODUCTION-BOOTSTRAP.md`](./docs/PRODUCTION-BOOTSTRAP.md) after explicit approval.

GitHub `production` requires:

```text
Secret: CLOUDFLARE_API_TOKEN
Variables: CLOUDFLARE_ACCOUNT_ID, STAGING_BASE_URL, PRODUCTION_BASE_URL, PRODUCTION_D1_DATABASE_ID
```

The Worker and D1 must already be named `bike-ops-production`.

## Production gates

- dispatch from current `main` only;
- package version and formal release manifest agree;
- accepted Staging commit is an ancestor with an identical source tree;
- live Staging `/health/ready` is ready;
- live Staging metadata reports `environment=staging` and the accepted SHA;
- Production Worker and D1 exist;
- GitHub Environment approval passes;
- Free-plan and no-billing confirmations pass;
- encrypted D1 export and successful restore drill are confirmed.

Only then does the workflow apply Production D1 migrations, deploy, and verify the exact Production identity.

## D1 migration evidence

Wrangler records applied files in `d1_migrations`. Runtime schema metadata is tied to the latest committed file in `migrations/d1`, with a test that fails when it drifts. Deployment logs remain the authoritative proof that a remote migration ran.

## Attachments

The active Worker returns `410 MEDIA_DISABLED` for attachment APIs. Legacy Fastify/Supabase code remains only for compatibility tests and is not an active runtime dependency.

## Domain cutover

`workshop.skin` remains on Staging until Production passes verification on an independent URL. Moving apex or `www` to Production is a separate approved operation.

## Rollback

Use a new revert commit and another approved deployment. D1 migrations are forward-only; do not run destructive down migrations or rewrite Git history.
