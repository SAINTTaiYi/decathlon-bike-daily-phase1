# Workshop normal vertical flow · Preview evidence

Date: 2026-08-01

## Scope

- Removed the GSAP Story Scroll runtime and its rotation/stacking handoff contract.
- Kept Overview, Pending, Other, Repair, Used, and Sales mounted in one ordinary vertical document flow.
- Kept the fixed six-destination dock; activation uses native `scrollIntoView` only.
- Removed module pinning, transforms, stacking, snap, wheel/touch/key interception, and private Story Scroll data markers.
- Public Preview version remains V5.7.9. Production and Production D1 were not touched.

## Identities

- Candidate: `75181be5480dd8bdf1f5bb0874dfdee5325e13fd`
- PR: `#122`
- Merge SHA / deployed source: `43196392db01a023bac5f0518c2cd33a9bd73438`
- Protected Preview workflow run: `30659737888`
- Cloudflare Worker version: `625d5d83-943c-45e9-9b82-e212f916914b`
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`

## Gates

- Focused normal-flow, responsive, mobile overview, and workspace-motion contracts passed.
- Full test suite passed.
- Typecheck passed.
- 88 workflow policies passed.
- Frozen full build passed after `version:preview` recorded the exact candidate SHA.
- PR `verify` and `secrets` checks passed.
- Post-change CodeGraph was synchronized and up to date.
- `git diff --check` passed.

## Independent live verification

- `/health/live`: HTTP 200, JSON, `ok`.
- `/health/ready`: HTTP 200, JSON, `ready`.
- `/api/v1/meta/version`: V5.7.9 and exact deployed merge SHA.
- HTTP redirects to HTTPS with 308.
- HSTS, CSP, X-Frame-Options, and X-Content-Type-Options are present.
- Online JS contains no `useStoryScroll`, `data-module-flow-stack`, or `data-module-flow-section` runtime markers.
- Online CSS proves `.workshop-module-stack` is column flex with no perspective/transform/snap and `.workshop-module-panel` is visible relative normal flow.
- Online JS SHA-256: `8dfb3005cf1ff6feed0c56981dc95c133b41674222d480ce60e105385d65c0de`.
- Online CSS SHA-256: `b6b28386418b392904009105544c69246cf8a2eccc399d67ce99e297d6a81a64`.

## Acceptance boundary

The independent `browser-harness` CLI is unavailable on this device. Per browser governance, no application browser or Android Accessibility fallback was used. Real authenticated scrolling and dock interaction remain for human Preview acceptance. No Production deployment is implied.
