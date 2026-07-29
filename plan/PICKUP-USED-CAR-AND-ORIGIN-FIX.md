# Pickup used-car identity and production origin fix

**Status:** functional change merged; Preview checkpoint pending
**Base:** `9093190055b667f951ba4874762c34f6d765c169`
**Scope confirmed:** 2026-07-25

## Requested behavior

1. The existing resale sale action must move the sold used bike into Pending Pickup and retain an explicit 二手车 identity.
2. The Pending Pickup add flow must let staff create a 二手车 Pending Pickup record manually. It needs only the source marker, vehicle/customer identifier, optional contact, and current status.
3. Pending Pickup cards and closing-report image exports must identify 二手车 records from both paths.
4. On `workshop.skin`, both exact production origins `https://workshop.skin` and `https://www.workshop.skin` must be allowed. Wildcard CORS is forbidden.

## Data and boundary decisions

- Persist `pickup_source = 'used-car'`; do not infer it from display strings.
- Resale sell converts the same work item from `resale` to active `pickup`, inserts canonical pickup detail, and retains resale detail/audit history for reversible operations.
- Used-car Pending Pickup has no self-pickup code/platform, no customer-storage detail requirement, and no sale-price/VIN/dossier fields.
- Existing repair, self-pickup, and customer-storage behavior is unchanged.
- Add synchronized D1 and Supabase migrations before changing routes; no schema mutation is performed in this worktree.
- No Preview, Staging, or Production deployment is part of this task until separately authorized.

## Verification plan

- Domain, frontend routing, report-model and Worker route/origin regression tests.
- D1/Supabase migration static tests and CI migration-count update.
- Full tests, typecheck, workflow validator, build, and clean Preview fingerprint validation.
- Browser Harness visual verification is unavailable/prohibited, so manual Preview visual acceptance will remain explicit and separate.


## Local validation evidence — 2026-07-25

- D1 migration `0005` was independently applied in an in-memory SQLite database after `0001`; it accepted `used-car`, rejected an unknown source, and retained the self-pickup platform constraint.
- `pnpm test`: Domain 5, Database 6, Web 103, API 16, Worker 13 — all passed.
- `pnpm typecheck`, `pnpm check:workflows` (88 policies), `git diff --check`, package compilation, and `pnpm build:worker-bundle` all passed.
- The root `pnpm build` wrapper intentionally remains blocked until this clean source checkpoint receives its Preview-source registration; it was not bypassed by a public version change.
- No Preview, Staging, or Production mutation has been performed.

## Integration checkpoint — 2026-07-25

- Functional PR [#58](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/58) merged normally into `feature/cloudflare-workers-d1` as `56bebc8f96cb8f2f7dd76f19ad91b3e0bfbd03a3`.
- PR CI `30123853176` passed both `verify` and complete-history `secrets` checks.
- Post-merge CI `30123980435` passed both `verify` and complete-history `secrets` checks on the exact merged SHA.
- Public version remains V5.7.8: this is Preview-only work and does not alter a formal-release version.
- User authorized Cloudflare **Preview only** after this administrative checkpoint merges. Staging and Production remain excluded; Preview still requires independent endpoint verification and user visual acceptance.

## Staging release-note completeness correction — 2026-07-25

- User identified that the rendered V5.7.8 Staging announcement omitted the accepted used-car workflow and formal-domain login-origin fix.
- Authorized correction: amend the existing **V5.7.8** announcement only; **no public version bump** and no Production action.
- `apps/web/src/data/releaseNotes.js` now states that: (1) a sold used car moves into Pending Pickup with the used-car identity retained; manual used-car Pending Pickup records plus card/report source labeling are supported; (2) both exact formal origins, `https://workshop.skin` and `https://www.workshop.skin`, pass login-origin validation while unknown/wildcard origins remain blocked.
- Local source assertions passed: V5.7.8 was retained, required used-car and both formal-origin phrases were present, and `git diff --check` was clean.
- Local targeted release/version tests passed (10/10). Full `pnpm test:web` could not complete in this isolated worktree because `node_modules`/React is absent; 80/83 tests passed before the three React-import suites failed at module resolution. Pull-request CI is required for clean-install complete validation.
- Next: commit, open normal PR, obtain green CI, merge to `feature/cloudflare-workers-d1`, then use the existing user-authorized Staging-only manual deployment workflow and verify the rendered announcement. Production remains forbidden.
