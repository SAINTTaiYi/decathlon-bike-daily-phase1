# Workshop Reference-Home Preview Evidence

## Status

- Environment: Preview only
- Human visual acceptance: pending
- Public version: V5.7.9 unchanged
- Preview URL: https://bike-ops-preview.geeklightonefish.workers.dev

## Source And Delivery Identity

- Functional candidate: `570a7c8a8533d8164080cca87db017e27ee2c76c`
- Functional PR: #106
- PR CI run: `30585650844` (`secrets` and `verify` passed)
- Normal merge and deployed identity: `8fa4368b4e82524eb73b4a9ad5721c30c22582c6`
- Protected Preview-only workflow run: `30586076585`
- Preview fingerprint: `d15fb2be7e5ed76764ecc528a32f359252925eab87fc6db5acef2f58a34f846c` / 379 files
- Cloudflare Deployment: `d9dce5a3-ee79-4134-ad97-0fe080b98255`
- Worker Version: `b22c48af-fc69-4170-9bd3-9083065d8040` at 100% traffic

## Verified Gates

- Reference-home Overview contracts: 11/11 passed.
- Combined Overview, continuous-canvas and motion contracts: 25/25 passed.
- Full `pnpm test`, repository typecheck, 88 workflow policies and official Web production build passed.
- Frozen offline install restored the local dependency tree to the locked Hono 4.12.32; its redirect/security contract passed 5/5. No Worker source was changed by this task.
- Post-change CodeGraph v1.5.0: 192 files / 2,316 nodes / 7,819 edges, up to date. CSS, Markdown and WebP are explicit non-indexed exceptions covered by build, contracts, source/license readback and SHA tests.
- Bounded credential-pattern scan found no matches. GitHub CI `secrets` is authoritative because local Gitleaks is unavailable.

## Protected Preview Deployment

Workflow run `30586076585` completed successfully on exact merge SHA `8fa4368b4e82524eb73b4a9ad5721c30c22582c6`:

- Free plan, no billing and Preview-only confirmations passed.
- Frozen install, source fingerprint, complete validation, Worker bundle and identity gates passed.
- Preview D1 reported `No migrations to apply`.
- Wrangler created Worker Version `b22c48af-fc69-4170-9bd3-9083065d8040`.
- The workflow's post-deploy check matched the new identity on attempt 1.

An independent client queried immediately after workflow completion and observed the previous edge identity once, so the recovery pipeline stopped without replaying deployment or writing success evidence. A later recovery check confirmed the new identity consistently. This was treated as edge convergence, not as permission to redeploy.

## Independent Public Verification

The recovered public Preview returns:

- `/health/live`: status `ok`, V5.7.9, Git SHA `8fa4368b4e82524eb73b4a9ad5721c30c22582c6`.
- `/health/ready`: status `ready`, V5.7.9, the same Git SHA.
- `/api/v1/meta/version`: V5.7.9, environment `preview`, platform `cloudflare-workers-d1`, the same Git SHA.
- Web shell: HTTP 200 with the expected application document.
- HTTP URL: 308 Permanent Redirect to HTTPS.
- Web security: HSTS, strict CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer policy and permissions policy.
- API metadata: `Cache-Control: no-store, private` and strict API CSP.

Remote asset bytes also match the committed SHA-256 values exactly:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `obsidian-oregon-760.webp` | 29,876 | `a15390725bdefa5851178dd80a5b5673c8f20ed016932bff028d46d6e9a314e5` |
| `mechanic-workbench-960.webp` | 51,618 | `904828cb3488107082bf2356fe8692771b6a89a9dfe2cc9e4b17ab7c30f064f4` |
| `mechanic-workbench-1600.webp` | 101,408 | `6c746d85ba41f7ac4e011cfbbcfb3b68969835ea27bfbdc7131347c53abef235` |

## Boundaries And Remaining Acceptance

- Staging, Production and Production D1 were not invoked or changed.
- Original JPEG files were not committed; production serves only the three documented self-hosted WebP derivatives.
- No Obsidian Assembly image, logo, font, copy or source code was copied or traced.
- `browser-harness` is unavailable. The prohibited application browser and Android Accessibility fallbacks were not used.
- Human acceptance must cover 320-430px visual fidelity, tablet/desktop rearrangement, bidirectional native scrolling, all Overview controls, fixed navigation, reduced motion and forced colors.
