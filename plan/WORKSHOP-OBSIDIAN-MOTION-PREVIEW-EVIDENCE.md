# Workshop Native Module Stages Preview Evidence

> **Status: rejected by human Preview review on 2026-07-30.** This document remains as deployment history only. The deployed implementation used a sticky material stage but did not implement the requested Obsidian Assembly About-style multi-layer parallax or typography. It is superseded by `plan/WORKSHOP-OBSIDIAN-PARALLAX-SPEC.md` and the `fix/workshop-obsidian-parallax` correction.

## Scope

- Objective: replace the unstable GSAP ScrollTrigger / pinned Story Scroll module switching system with native continuous vertical module stages.
- Confirmed interaction contract: each of the six mounted modules has a short sticky material cover/reveal stage; long business lists then continue in ordinary document flow; the workspace entry reveal remains skippable.
- Explicitly excluded: wheel, touch, keyboard paging interception; GSAP pin spacers; ResizeObserver-driven scroll refresh and correction; Staging, Production and Production D1 changes.

## Source Identity

- Functional commit: `73e45ddf5f22438e86edd2001568a84d1891b8c9` (`feat(workshop): replace story scroll with native stages`).
- Parent / Preview baseline: `5689caf5a484cf749eb1a6cbc3b4ac7f95fabcba`.
- PR: [#100](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/100), `feat/workshop-obsidian-motion` -> `feature/cloudflare-workers-d1`.
- PR CI: run `30493348339`; `secrets` and `verify` succeeded.
- Actual ordinary merge and Preview deployment identity: `b2376f550c0a8b3af6b7d0ec05dff6526f24fde7`.
- Public version: `V5.7.9` unchanged. Preview fingerprint for the functional commit: `fb807b5804fd9b3cd650e631db86f95e53a0fda4de776e65a498cb3267274639` across 366 files.

## Implementation

- Added `apps/web/src/hooks/useModuleStages.js`: stable anchor navigation and passive `IntersectionObserver` active-module tracking.
- Removed `apps/web/src/hooks/useStoryScroll.js`: no `ScrollTrigger`, scrub, pinning, `pinSpacing:false`, or content-size refresh remains in the module transition implementation.
- Added the `ModuleStage` shell in `apps/web/src/App.jsx`: all six modules remain mounted and retain business/local state.
- Added native sticky cover/runway/content geometry in `apps/web/src/styles/workshop-system.css`; the first overview stage is unoccluded, while later content overlaps only in the reveal interval and then returns to normal flow.
- Workspace entry remains Escape/pointer skippable and uses a short clip-path reveal without perspective, 3D rotation or blur.
- Added original self-hosted texture `apps/web/public/images/ops/workshop-slate-texture.png`; provenance and SHA are documented in `apps/web/public/images/ops/SOURCES.md`.

## Quality Gates

- Targeted motion contract: `node --test tests/workspace-motion.test.mjs` — 6 passed, 0 failed.
- Related Workshop regression set: 25 passed, 0 failed.
- Final full repository test task: `workshop-obsidian-motion-final-tests`, first attempt succeeded; Worker terminal segment 28 passed, 0 failed.
- Final typecheck task: `workshop-obsidian-motion-final-typecheck`, first attempt succeeded.
- Local Preview candidate build task: `workshop-obsidian-motion-preview-build`, first attempt succeeded.
- CodeGraph v1.5.0 post-change sync/status: 189 files, 2,271 nodes, 7,648 edges; index up to date. `affected` identified `tests/workspace-motion.test.mjs`.
- Explicit CodeGraph coverage exceptions: Markdown and PNG assets are not indexed; the PNG signature/SHA, source record, static build copy and deployed asset hash were verified separately. Source-scanning contracts beyond import traversal were explicitly included in the related regression set.

## Preview Deployment

- Deployment workflow: [run 30493526636](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30493526636).
- Guardrails passed: Free plan, no billing, Preview-only, exact protected branch head, frozen install, full test/typecheck/build, Worker bundle, Preview D1 migration and deployed identity checks.
- Preview URL: https://bike-ops-preview.geeklightonefish.workers.dev
- Cloudflare Worker Version: `2b3ab1ac-032c-466c-9ed9-784a506a99bf`.
- Preview D1 migrations completed in the Preview environment only. Staging, Production and Production D1 were not accessed or modified.

## Independent Public Verification

- `/health/live` returned `status=ok`, `version=5.7.9`, `gitSha=b2376f550c0a8b3af6b7d0ec05dff6526f24fde7`.
- `/health/ready` returned `status=ready` with the same version and SHA.
- `/api/v1/meta/version` returned `environment=preview`, `appVersion=5.7.9`, `platform=cloudflare-workers-d1` and the same SHA.
- `/` returned a valid HTML shell.
- `/images/ops/workshop-slate-texture.png` returned HTTP 200 as `image/png`; SHA-256 is `97400d536978cddfe31ab84d4eeba6cf2e6c82a1b651949a9b19b1d2a4f7bae8`, matching the committed source asset.
- Observed response protections include HSTS, strict CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and restrictive permissions policy.

## Acceptance Boundary

The Preview is ready for human interaction and visual acceptance. Do not deploy Production from this work without an explicit user approval after Preview review.
