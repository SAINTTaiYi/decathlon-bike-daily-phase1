# Workshop static poster v2 Preview evidence

Status: Protected Preview-only deployment independently verified; pending human acceptance.

## Scope

- Overview only: single static industrial poster based on the supplied 852 x 1876 layout.
- Five dedicated business modules and all workflow/handler boundaries unchanged.
- Public version remains V5.7.9; Production and Production D1 are out of scope.

## Candidate facts

- Baseline: `69743619ce55796c5683eeb77a96fdfbf1205630`.
- Derived asset: `obsidian-orange-cut-900.webp`, SHA-256 `306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258`, documented public-domain source.
- Local gates: frozen offline install, complete tests, typecheck, workflow policy checks, direct Web build, CodeGraph post-sync and bounded credential scan passed.
- Post-edit CodeGraph: 192 files / 2,309 nodes / 7,804 edges, up to date.
- Functional commit: `8e7d4685a8d3063f3e7d583438358a86181e82f0`.
- PR #108: CI run `30595591583`; `secrets` and `verify` passed; normal merge `ea6de842df8e91726b8743ee6d0a56887b33c40d`.
- Protected Preview-only run: `30595773003`, successful with Free/no-billing/Preview-only gates, frozen install, full validation, and Preview D1 `No migrations to apply`.
- Preview manifest: V5.7.9 unchanged, fingerprint `50568b5166aba46632073c71ebf1a9b1ee4c86de717162402cd82843dfe69e0f`, 380 files.
- Cloudflare Deployment: `0f001613-9600-4e42-956a-000ff8e9ecac`; Worker Version `397bb002-a388-430b-8bab-d1b67261063b` (#105), 100% traffic.
- Independent checks: live, ready, metadata, Web shell, strict security headers, HTTP 308 and remote asset SHA `306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258` passed on `ea6de842df8e91726b8743ee6d0a56887b33c40d` / `environment=preview`.
- The deployment workflow initially observed the old edge SHA, then converged after about 45 seconds without replaying deployment.
- Staging, Production and Production D1 were not invoked or changed.
- `browser-harness` was not available; prohibited application-browser and Accessibility fallbacks were not used. Visual acceptance at 320–430px, 600/840/1200px, reduced-motion and forced-colors remains a human Preview gate.
