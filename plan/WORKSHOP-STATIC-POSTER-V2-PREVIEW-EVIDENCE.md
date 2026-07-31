# Workshop static poster v2 Preview evidence

Status: Protected Preview independently verified; human visual acceptance pending.

## Scope

- Overview only: one static industrial poster based on the supplied 852 x 1876 layout.
- The five dedicated business modules and all workflow/handler boundaries are unchanged.
- Public version remains V5.7.9. Staging, Production, Production D1 and all Production data are out of scope and untouched.
- No visual browser was used because browser-harness is unavailable; application browser and Accessibility fallbacks were not used.

## Candidate and local gates

- Administrative baseline: `69743619ce55796c5683eeb77a96fdfbf1205630`.
- Functional candidate: `8e7d4685a8d3063f3e7d583438358a86181e82f0`.
- Derived asset: `obsidian-orange-cut-900.webp`, SHA-256 `306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258`, with documented public-domain source and transformation.
- Frozen offline install, complete repository tests (194/194), typecheck, 88 workflow policies, direct Web build and official `build:web` passed.
- Preview manifest: git SHA `8e7d4685a8d3063f3e7d583438358a86181e82f0`, fingerprint `50568b5166aba46632073c71ebf1a9b1ee4c86de717162402cd82843dfe69e0f`, 380 files; public V5.7.9 unchanged.
- Post-edit CodeGraph v1.5.0: 192 files / 2,309 nodes / 7,804 edges, up to date. CSS, Markdown and WebP are explicit non-indexed exceptions covered by contracts, build, source/license readback and exact SHA verification.
- Bounded credential-pattern scan found zero matches. Local Gitleaks is unavailable, so GitHub CI `secrets` is authoritative.

## PR and protected Preview

- Feature PR #108: https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/108
- CI run `30595591583`: `secrets` and `verify` succeeded.
- Normal merge identity: `ea6de842df8e91726b8743ee6d0a56887b33c40d`.
- Protected Preview-only workflow run `30595773003`, job `91047711439`, succeeded once on exact ref `feature/cloudflare-workers-d1` and exact release SHA `ea6de842df8e91726b8743ee6d0a56887b33c40d`.
- Free-plan, no-billing and Preview-only gates passed. Preview D1 reported `No migrations to apply`.
- The workflow recorded 380 files and public V5.7.9 unchanged. It matched the new edge identity on its ninth read-only poll; deployment was not replayed.

## Independent verification

- Preview URL: https://bike-ops-preview.geeklightonefish.workers.dev
- Cloudflare Deployment: `0f001613-9600-4e42-956a-000ff8e9ecac`.
- Worker Version: `397bb002-a388-430b-8bab-d1b67261063b`, receiving 100% traffic.
- `/health/live`, `/health/ready` and `/api/v1/meta/version` returned HTTP 200 JSON envelopes and exact identity `ea6de842df8e91726b8743ee6d0a56887b33c40d`; metadata reports `environment=preview` and V5.7.9.
- `/` returned HTTP 200 `text/html` with a doctype. HTTP redirected to HTTPS with 308.
- HSTS, strict CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, referrer policy and permissions policy passed; API cache control is `no-store`.
- Remote `obsidian-orange-cut-900.webp` SHA-256 exactly matched `306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258`.
- JSON bodies were parsed only after validating status, content type and first non-whitespace byte. No HTML error envelope was observed.

## Human acceptance

Human review remains required for the 320-430px static poster match, tablet/desktop responsive rearrangement, native bidirectional scrolling, all real Overview controls, fixed navigation, reduced-motion and forced-colors behavior. This evidence does not authorize Staging or Production.
