# Operational safety runbook

This runbook records the environment and release failures observed during the 2026-08-12 flat-store registration and closing-layout work. Follow it before editing, testing, or deploying this repository.

## Why this exists

Two production-like Preview regressions exposed gaps that ordinary health checks did not catch:

1. Preview D1 had already applied the flat-store migration, but a later deployment restored a legacy registration UI and route that queried the removed region and city tables. `/health/ready` still passed because it only runs `SELECT 1`; the real registration endpoint failed with `INTERNAL_ERROR`.
2. The closed-state overview rendered two additional actions inside a fixed-height card. The actions overflowed beneath the following sales card even though the normal state looked correct.

The prevention rules below are release requirements, not optional cleanup.

## Termux preflight

Do not assume desktop utilities exist. Check the environment before choosing commands:

```bash
for tool in git node pnpm gh curl sed grep find; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool"; exit 1; }
done

for optional in apply_patch rg perl chromium playwright; do
  command -v "$optional" >/dev/null 2>&1 \
    && echo "available: $optional" \
    || echo "unavailable: $optional"
done
```

Known constraints in the Android Termux environment used for this project:

- `apply_patch`, `rg`, and `perl` may be absent.
- Playwright, Puppeteer, and Chromium may be absent; do not claim screenshot verification without an actual browser.
- `/tmp` is not guaranteed to exist. Use `${TMPDIR:-$HOME/.tmp}` or a directory created by `mktemp -d "$HOME/name.XXXXXX"`.
- New Git worktrees do not inherit `node_modules`.
- GitHub API secret scanning is unavailable when GitHub Advanced Security is disabled. The repository CI Gitleaks job remains the required secret-scanning gate.

## Safe command construction

Keep shell operations small and independently verifiable.

- Do not combine logging, complex quoting, repository mutation, and verification in one long command.
- Use exact branch names copied from `git branch -avv` or `git ls-remote`; never type a remembered approximation.
- Run read-only checks first, then one mutation, then verification.
- Prefer argument arrays or single-purpose commands over nested shell interpolation.
- When a command fails because of quoting or a missing tool, stop and inspect the state before trying another method.

Recommended branch inspection:

```bash
git fetch --prune origin
git status --short --branch
git branch -avv
git ls-remote --heads origin
git rev-parse HEAD
git rev-parse "origin/$BRANCH"
```

## Safe editing fallback

Use this order:

1. Use `apply_patch` when it is available.
2. Otherwise generate a unified patch and run `git apply --check` before `git apply`.
3. For a one-line replacement only, first prove the target is unique, then use a guarded `sed` replacement.
4. After every edit, inspect `git diff`, run `git diff --check`, and verify the expected markers.

Guarded one-line replacement example:

```bash
needle='exact source line'
test "$(grep -Fc "$needle" path/to/file)" = 1
sed -i 's#exact source line#replacement line#' path/to/file
git diff --check
git diff -- path/to/file
```

Never continue after a failed patch assuming that part of it applied. Check `git status` and the target files first.

## Isolated worktree builds

Prefer a clean worktree per task:

```bash
git worktree add -b fix/example "$HOME/worktrees/example" origin/main
cd "$HOME/worktrees/example"
pnpm install --frozen-lockfile
```

When network access is intentionally unavailable, local dependency links from another worktree may be used only as an untracked build aid. They must never be staged or committed. Verify with:

```bash
git status --short
```

Preview source registration requires a committed, clean source tree. The correct order is:

```bash
git diff --check
pnpm test:web
pnpm typecheck
git add <scoped-files>
git commit -m "fix: ..."
pnpm version:preview
pnpm check:workflows
pnpm test
pnpm typecheck
pnpm build
```

`pnpm version:preview` records the current commit and source fingerprint. Running it against a dirty or uncommitted source is intentionally rejected.

## D1 compatibility and migrations

Preview D1 is persistent across deployments. A deployment rollback does not roll back applied migrations.

`/health/ready` proves only that D1 answers a trivial query. It does not prove that every runtime query matches the deployed schema.

Before deployment:

1. Read the live `/api/v1/meta/version` response and record `schemaVersion` and `gitSha`.
2. Compare the candidate runtime's `SCHEMA_VERSION` and migration set with the live schema.
3. Exercise the business endpoints affected by the migration.
4. Reject any old runtime that references tables or columns already removed from the live D1.

Use expand-contract migrations for destructive changes:

1. **Expand:** add new tables/columns while retaining old ones.
2. **Migrate:** deploy code that supports both schemas and backfill data.
3. **Contract:** remove legacy schema only after old runtimes can no longer be deployed.

Do not drop a table or column in the same rollout that first stops reading it unless rollback and branch deployment controls make an old runtime impossible.

## Preview deployment rules

The selected `release_sha` must equal both the checked-out commit and the remote head of the selected branch. Temporary `if: true` workflow gates must not be merged as permanent release policy.

After dispatching Preview:

1. Poll the GitHub Actions run until it is terminal.
2. Require successful test, typecheck, build, migration, deploy, and built-in identity verification steps.
3. Independently poll `/health/live` and `/health/ready` until both report the exact release SHA.
4. Read `/api/v1/meta/version`; verify version, `gitSha`, `schemaVersion`, environment, and platform.
5. Fetch the actual HTML, resolve its JS/CSS asset names, and verify feature-specific required and forbidden markers.
6. Exercise at least one affected business endpoint; health checks alone are insufficient.
7. Probe the final state three times to catch edge convergence or stale-isolate behavior.
8. Verify `workshop.skin` or any non-target environment still reports its previous SHA.
9. Only then send the Preview URL for acceptance.

Example identity probes:

```bash
BASE=https://bike-ops-preview.geeklightonefish.workers.dev
curl -fsS "$BASE/health/live"
curl -fsS "$BASE/health/ready"
curl -fsS "$BASE/api/v1/meta/version"
curl -fsS "$BASE/" > "${TMPDIR:-$HOME}/preview-index.html"
```

Feature-specific verification is mandatory. For the flat registration incident, the published JS had to contain `storeCode` and `storeName` and had to omit `registration/directory`, `请选择区域`, and `请选择城市`.

## Shared Preview protection

Preview is a shared environment. Before a new deployment:

- inspect the latest successful Preview run and its source SHA;
- check whether the candidate branch is older or schema-incompatible;
- do not let an unrelated branch overwrite a currently accepted Preview without explicit intent;
- record the deployed branch, SHA, run URL, schema, and asset fingerprints.

If multiple PRs implement the same feature, choose one canonical branch and close or clearly mark the others. Conflicting open PRs and overlapping deployable branches increase overwrite risk.

## Responsive state layout rule

A fixed-height container must not receive conditional children unless each state has an explicit, tested size.

For status-dependent actions:

- keep the normal compact layout unchanged;
- expose the state on the parent, for example `data-closed="true"`;
- reserve the action row inside normal document flow;
- account for padding, gaps, and minimum 44px touch targets;
- cover mobile and desktop selectors in regression tests;
- verify the following sibling cannot overlap the state-specific controls.

The closing-card regression is the reference pattern:

- normal state remains `154px`;
- closed mobile state reserves `206px` for the extra two-button row;
- desktop closed state adds a third `52px` grid row;
- tests assert the state marker, both buttons, and both responsive rules.

Do not solve this class of issue with `z-index`; the parent layout must reserve real space.

## Verification checklist

Before reporting completion:

```text
[ ] Exact branch and remote head confirmed
[ ] Worktree contains only intended changes
[ ] git diff --check passes
[ ] Focused regression test passes
[ ] Full tests pass
[ ] Typecheck passes
[ ] Production build passes
[ ] Preview workflow completes successfully
[ ] Live SHA matches release_sha
[ ] Live schema is compatible with runtime
[ ] Published JS/CSS contains required markers
[ ] Affected business endpoint works
[ ] Three final health/identity probes pass
[ ] Non-target environments remain unchanged
[ ] Run URL, Preview URL, SHA, and root cause recorded
```
