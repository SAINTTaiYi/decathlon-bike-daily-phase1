# Free-stack deployment summary

## Executive status

The application is now designed for this no-card, zero-fixed-cost stack:

```text
EdgeOne Makers Free
  → Vite/React Web + same-origin Node.js Cloud Functions
      → Supabase Free PostgreSQL
      → Supabase Free private Storage
```

The old Railway container, Cloudflare Pages Direct Upload, Cloudflare R2, infrastructure-state PR, and provider-token bootstrap automation have been removed from the active codebase.

No Supabase or EdgeOne project has been created. Staging is not deployed. Production remains forbidden.

## Platform decision

| Layer | Platform | Reason |
|---|---|---|
| Web + API | EdgeOne Makers Free | One same-origin project for static Web and Node.js Cloud Functions; no fixed server or foreign-card requirement |
| Database | Supabase Free PostgreSQL | Preserve transactions, relational constraints, audit history, revision control, and existing SQL model |
| Media | Supabase Free private Storage | Reuse the isolated project, keep objects private, and issue short-lived object-scoped URLs |
| Source / CI | GitHub Free | Private source, protected environments, tests, migration gate, Gitleaks, and auditable deployment approvals |

## Release design

EdgeOne projects watch dedicated branches instead of `develop`/`main`:

```text
develop → approved workflow → migrate Staging DB → edgeone-staging → EdgeOne Staging
main    → approved workflow → migrate Production DB → edgeone-production → EdgeOne Production
```

This prevents an ordinary code push from deploying before database migration approval.

The promotion script:

- accepts only `edgeone-staging` or `edgeone-production`;
- reads the remote branch first;
- rejects non-fast-forward movement;
- uses normal `git push` only;
- never force-pushes or rewrites history.

## Runtime boundary

EdgeOne build:

- uses pinned Node 22.11.0 and pnpm 9.15.9;
- installs from the frozen lockfile;
- builds API output and Web output;
- generates package version and checked-out Git SHA metadata;
- does not run migrations or write cloud resources.

EdgeOne runtime receives only environment-specific application values. Migration uses a separate GitHub Environment secret and never enters runtime.

## Database and Storage

Runtime:

```text
DATABASE_URL
  Supavisor transaction pooler
  port 6543
  max pool size 1 per warm function instance
  prepare=false
```

Migration:

```text
MIGRATION_DATABASE_URL
  Supavisor session pooler
  port 5432
  GitHub/local migration only
```

The migration runner uses advisory locking, per-file SHA-256, transaction boundaries, and immutable history. The private Storage migration reconciles `bike-ops-media` with private access, a 10 MB file limit, and JPEG/PNG/WebP allowlisting.

## Attachment integrity

The API does not trust browser metadata alone:

1. validate user/store/record/MIME/size/count;
2. create pending attachment;
3. return object-scoped signed upload URL;
4. inspect Storage object metadata;
5. download the object server-side;
6. compute actual SHA-256;
7. mark ready only on an exact match;
8. use short-lived signed download URL;
9. soft-delete database visibility before object cleanup.

## GitHub release gates

### Staging

Manual from `develop` only:

- exact current remote SHA;
- Free-plan confirmation;
- no-billing/automatic-upgrade confirmation;
- Staging-only confirmation;
- full tests/typecheck/build;
- migration before branch promotion;
- exact deployed SHA/version/environment/database/Web verification.

A `database_only_bootstrap` mode applies the schema before the first EdgeOne project import, preventing an initial function deployment against an empty database.

### Production

Manual from `main` only, additionally requiring:

- exact requested version and main SHA;
- current accepted `edgeone-staging` SHA;
- accepted Staging ancestry and identical source tree;
- Production Environment reviewer approval;
- explicit Production approval;
- encrypted external backup confirmation;
- successful restore-drill confirmation;
- Free-plan and no-billing confirmations.

Production deployment branch/project must be prepared only after separate approval.

## Free-tier operations

Current capacity budget:

| Resource | Budget |
|---|---:|
| Supabase database | 500 MB |
| Supabase Storage | 1 GB |
| Supabase bandwidth | 10 GB aggregate: 5 GB cached + 5 GB uncached |
| EdgeOne projects | 40 |
| EdgeOne builds | 500/month |
| EdgeOne Cloud Functions | 1,000,000 executions/month |
| EdgeOne Edge Functions | 3,000,000 executions/month |
| EdgeOne site storage | 5 GB |

Operational thresholds:

- 70%: cleanup/archive plan required.
- 85%: freeze non-essential media uploads and investigate.
- Quota warning: incident; never permission to enable billing automatically.

Supabase Free inactivity pause and lack of Production-grade managed daily backup/PITR remain explicit limitations.

## Security boundary

- HttpOnly session, CSRF, RBAC, Argon2id, and password pepper.
- AES-256-GCM protected contacts.
- Pickup codes never persisted.
- Supabase secret key server-only.
- Explicit CORS origins; no wildcard.
- Environment separation across GitHub, EdgeOne, Supabase, database passwords, and application secrets.
- No secrets in repository, state, deployment receipts, or normal chat.
- Network-unreachable errors stop and request VPN instead of blind retries.

## Immediate next steps

1. Finish versioned full local validation and ordinary push to `develop`.
2. Repeat the current Supabase project cost as 0 yuan/month and confirm the region.
3. Create Supabase Free Staging project.
4. Configure GitHub Staging `MIGRATION_DATABASE_URL` and run database-only bootstrap.
5. Create `edgeone-staging`, import it into an EdgeOne Makers Free project, configure runtime variables, and set `EDGEONE_SITE_URL`.
6. Run the full Staging release workflow and retain its receipt.
7. Complete full Staging acceptance.
8. Keep Production forbidden until separate approval, encrypted export implementation, and restore drill.

Full runbook: [`AUTOMATED-DEPLOYMENT.md`](./AUTOMATED-DEPLOYMENT.md).
Staging setup: [`docs/STAGING-ACCOUNT-SETUP.md`](./docs/STAGING-ACCOUNT-SETUP.md).
