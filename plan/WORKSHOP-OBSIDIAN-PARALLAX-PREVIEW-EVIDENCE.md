# Workshop True Multilayer Parallax Preview Evidence

> **Status: rejected by human Preview review.** This historical evidence records deployed identity `73a02372619261fdba66b32765edb8f6fa011070` only. It is not an accepted design baseline and does not authorize a Production release.

The reviewer rejected the independent black stage covers and fixed large module panels because they did not form one immersive cross-module spatial canvas. The replacement specification is `plan/WORKSHOP-CONTINUOUS-CANVAS-PREVIEW-EVIDENCE.md`.

## Scope

- Objective: correct the rejected static sticky treatment by implementing the complete About-derived multilayer parallax mechanism for all six Workshop business modules.
- Every mounted stage now uses continuous normalized scroll progress with independent material backdrop, three offset title lines, one original transparent Workshop object, two moving curve-copy paths, a seven-word focus trail, and transformed character entry.
- Business cards retain the approved warm-white Workshop design and remain in native document flow after each short stage.
- Native scrolling is preserved: no wheel, touch, paging-key interception, GSAP pin spacer, or content-size scroll correction is used.
- `prefers-reduced-motion` presents a complete static composition without requiring animation to understand the module.

## Source and Delivery Identity

- Functional commit: `a9cc870a3c56e335243b0d766a03f45966402f8a`.
- PR: [#102](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/102), `fix/workshop-obsidian-parallax` -> `feature/cloudflare-workers-d1`.
- PR CI run: [30518797194](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30518797194); `secrets` and `verify` succeeded.
- Ordinary merge and actual Preview identity: `73a02372619261fdba66b32765edb8f6fa011070`.
- Post-merge CI run: [30518965973](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30518965973); full-history Gitleaks, tests, typecheck, build and frontend policy checks succeeded.
- Public version remains `V5.7.9`.
- Preview fingerprint: `61c4f2c28036c8bf59d96c13f7142cc03429ff4c5ff6df209690acc9b5650659` across 376 versioned files.

## Quality Gates

- Targeted module-stage, workspace, mobile overview, material and update-dialog regressions: 30 passed, 0 failed.
- Full repository `pnpm test`: passed in `workshop-obsidian-parallax-full-tests`, attempts 1, exit 0.
- Repository `pnpm typecheck`: passed in `workshop-obsidian-parallax-typecheck`, attempts 1, exit 0.
- Root version-gated `pnpm build:web`: passed in `workshop-obsidian-parallax-root-build`, attempts 1, exit 0.
- CodeGraph v1.5.0 post-change index: 192 files / 2,299 nodes / 7,710 edges, up to date. Affected tests are `tests/module-stage-progress.test.mjs` and `tests/workspace-motion.test.mjs`.
- CSS, Markdown and SVG are explicit CodeGraph indexing exceptions. They are covered by production build, source contracts, deterministic regeneration, provenance records and per-file SHA-256 checks.

## Preview Deployment

- Preview URL: https://bike-ops-preview.geeklightonefish.workers.dev
- Protected Preview-only workflow: [30519156005](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30519156005), succeeded.
- Guardrails passed: exact remote branch head, Free plan confirmation, no-billing confirmation, Preview-only confirmation, frozen install, full validation and deployed identity polling.
- Preview D1: `No migrations to apply`.
- Cloudflare Deployment: `f7d0a396-440e-4b27-acdb-4ced75398e0f`.
- Worker Version: `00a40d0c-3acb-4ad2-a265-cb04a1fafd2e` (#102), 100% traffic.
- Staging, Production and Production D1 were not deployed, accessed or changed by this release flow.

## Independent Public Verification

- `/health/live`: `status=ok`, `version=5.7.9`, `gitSha=73a02372619261fdba66b32765edb8f6fa011070`.
- `/health/ready`: `status=ready`, same version and SHA.
- `/api/v1/meta/version`: `environment=preview`, `platform=cloudflare-workers-d1`, same version and SHA.
- Root path returned the Chinese Web shell.
- HTTPS security headers include HSTS, strict CSP with `frame-ancestors 'none'`, `DENY`, `nosniff`, strict referrer policy and restricted permissions policy.
- Plain HTTP returned `308 Permanent Redirect` to the HTTPS Preview URL.
- Deployed original stage objects matched source SHA-256 values:
  - `pulse-drivetrain.svg`: `4c49e26f4f8d75125704174f4e540888eb0ccbf3829a418046aa4f5ccdc47222`
  - `pickup-wheel-rack.svg`: `41a56232388a5b0269af4469e9178edfdea90d4058005bcef59f2e4263754e6e`
  - `handover-clipboard.svg`: `b8c89ba2b94f1c36e49018506ce584e7fea9aef26b87ce2527501dbe8c2b80db`
  - `repair-service-stand.svg`: `9c499b6c25157ff818d13c9bc10b6c2bae364c389fc17ec864ce81b1340e0d1a`
  - `resale-second-life.svg`: `3be27b06ab8826bf88c701a9fa98038945a80ab5d369953dbc1a8b0af9b4e655`
  - `sales-counter-stack.svg`: `f32405e0df6178de95111d2845c53344d344a7ee299ab00a1ca2bceee94bcaee`

## Human Acceptance Checklist

1. Load the Preview and complete or skip the initial full-page reveal.
2. Scroll naturally through all six modules, then scroll back upward through all six.
3. Confirm each stage visibly has multiple independent depth rates: material/backdrop, three title lines, transparent object, moving curve copy and sequential word focus.
4. Confirm every module has its own Workshop object and that no reference-site proprietary image, logo or font appears.
5. Confirm transitions remain continuous and reversible without jumping, flashing, duplicated headers, input interception or trapped scrolling.
6. Confirm the warm-white business content follows each stage and remains usable, including lists, filters, forms, dialogs and fixed bottom navigation.
7. Confirm narrow mobile and wider tablet/desktop layouts do not overflow horizontally or hide business actions behind the dock.
8. If available, enable reduced motion and confirm every stage becomes a complete readable static composition.

## Browser Evidence Limitation

- The required independent `browser-harness` CLI is not available in the current environment.
- Per project policy, no application-internal browser tool or Android Accessibility fallback was used.
- Therefore final visual, scrolling and interaction acceptance remains a human Preview gate.
