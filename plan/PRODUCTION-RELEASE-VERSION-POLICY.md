# Production-only public version policy

**Status:** locally validated; ready for normal PR/CI validation
**Policy confirmed:** 2026-07-24
**Applies from:** after existing Preview V5.7.8; no retroactive version rewrite.

## Rule

1. Preview deployments are review artifacts, not public releases. They retain the currently published version and must never run a public version increment.
2. The user manually accepts a Preview first. Only when the user explicitly asks for a Production release may the release process aggregate the accepted Preview cycle into one public announcement and increment the version.
3. The formal release commit carries the aggregated announcement, its accepted Preview commit range, and the incremented public version. That exact source must complete the existing Staging and Production gates.

## Technical enforcement

- `pnpm version:preview` records a source fingerprint in `preview-manifest.json` without changing `package.json`, web package version, or `releaseNotes.js`.
- `pnpm version:release` requires `--formal-release true`, a clean committed accepted Preview HEAD, the continuous Preview range, and a complete announcement. It resolves and records every range commit (full SHA plus subject); it is the only supported public bump path.
- The first governed range starts after existing V5.7.8 Preview SHA `dabe0ed8d1ba662840460837c88bf288fb3ffaaa` without retroactively rewriting it. Later ranges must start at the preceding formal-release commit.
- `pnpm version:release:stamp` requires the formal-release marker and writes the public version fingerprint.
- Normal builds accept either a current public fingerprint or a current Preview fingerprint. Production validation accepts only a current public fingerprint plus a valid `formal-release.json`, recomputes its Git range/commit list, and rejects post-Preview paths outside the five formal version files.
- Production workflow requires an explicit aggregated-announcement confirmation and runs the Production-only version validation before any migration or deployment mutation.

## Local validation evidence

- Syntax checks and `git diff --check` passed.
- Workflow policy validator passed all 88 policies.
- Focused version-policy suite passed 9/9.
- Full suite passed 137/137: Domain 4, Database 5, Web 101, API 16, Worker 11.
- Full workspace typecheck passed.
- Dependencies were restored with a frozen offline install; no dependency download or lockfile change occurred.
- Functional policy checkpoint: `3d7495d54ab6ec098be1dfc07d49dd10575f29db` (`feat(release): govern Preview and Production versions`).
- Clean-commit Preview-path verification passed at that SHA: `pnpm version:preview` retained V5.7.8 and bound the 323-file fingerprint to the committed SHA; standard `pnpm check:version` and `pnpm build` passed.
- Negative Production-path verification passed: `pnpm check:version -- --mode production` rejected the Preview fingerprint and missing `formal-release.json` before any deployment mutation.
- The unreferenced V5.2.7 `code/index.json` static snapshot was removed during the 2026-07-29 design-document consolidation. It was never a runtime, CI, deployment, or current CodeGraph source of truth.

## Boundaries

- This policy does not make Preview, Staging, or Production automatic.
- Production remains separately gated by explicit user authorization, accepted Staging source, backup/restore evidence, free-plan/no-billing checks, and environment approvals.
- Version rollover semantics remain unchanged: patch `10` advances the minor version and resets patch to `0`.
