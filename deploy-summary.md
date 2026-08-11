# Cloudflare deployment summary

## Runtime

```text
Cloudflare Worker
  -> Workers Static Assets (React/Vite)
  -> Hono API
  -> Cloudflare D1
```

Preview and Staging are deployed on separate Workers and D1 databases. `workshop.skin` currently reports `APP_ENV=staging`. Production resources do not exist yet.

## Canonical workflows

- `ci.yml`: policy, tests, typecheck, build, and secret scan.
- `deploy-cloudflare-preview.yml`: manual isolated Preview deployment.
- `deploy-cloudflare-staging.yml`: manual Staging deployment from an exact branch-head SHA.
- `deploy-production.yml`: manual Cloudflare Production deployment after bootstrap and all release gates.

`deploy-staging.yml` and `onboard-workshop-skin-staging.yml` are retired audit markers and cannot mutate cloud resources.

## Current release state

- Public version: `V5.9.2`.
- Latest D1 migration: `0011_directory_guangxi_cities.sql`.
- Runtime schema metadata is now tied to the latest committed D1 migration.
- Full local verification on the release-governance branch passed: Domain 7, Database 15, Web 260, API 21, Worker 68; typecheck and production build also passed.
- Staging still needs the latest accepted `main` SHA deployed and manually verified.
- Production needs an isolated Worker, D1, secrets, encrypted export, and restore drill before release.

## Next gates

1. Merge the release-governance PR after GitHub CI passes.
2. Dispatch Cloudflare Staging from the merged `main` SHA.
3. Verify login, registration, password change, closing, pickup, repair, audit, and admin flows on Staging.
4. Create isolated Production resources only after acceptance and explicit approval.
5. Complete encrypted D1 export and restore drill.
6. Dispatch the Production workflow.
7. Move `workshop.skin` from Staging to Production after independent Production verification.
8. Create the `v5.9.2` Git tag and GitHub Release only after Production identity is verified.

Full runbook: [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md).
