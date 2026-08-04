# Workshop desktop scene-wipe scope R6 — Preview

## Correction

R5's yellow scene wipe incorrectly painted across the full viewport. The confirmed desktop boundary is the changing right business region only:

- horizontal start: native board x = 262px, matching the left-rail divider and module-header margin;
- vertical start: native board y = 90px, directly below the global header;
- included: right module title bar and the changing business content;
- excluded and fixed: complete global header, left navigation and release announcement card.

## Implementation

- `App.jsx`: wraps the animated yellow layer in `.desktop-scene-transition-viewport`.
- `desktop-workbench.css`: viewport uses `position: fixed; inset: 90px 0 0 262px; overflow: hidden; contain: paint; isolation: isolate`; the wipe itself is now absolute inside that boundary.
- `useDesktopSceneTransition.js`: removes left active-navigation scale/overshoot; only the right module header and panel participate in spatial choreography.
- Strong diagonal yellow/black choreography, directional entrances and right-region component staggers remain unchanged.
- Both wrapper and wipe remain desktop-only and are removed under `prefers-reduced-motion: reduce`.
- Mobile path remains untouched.

## Gates

- Mandatory CodeGraph pre-edit: 201 files / 2,375 nodes / 7,797 edges, up to date.
- Full local suites passed: Domain 7, Database 10, Web 160, API 21, Worker 28; typecheck passed; 88 workflow policies passed.
- Focused R6/R5/R4/R3/workspace contracts: 19 passed, 0 failed; left-rail immobility is explicitly asserted.
- `git diff --check`: passed.
- Post-implementation CodeGraph: 201 files / 2,375 nodes / 7,769 edges, up to date.
- CSS and Markdown are CodeGraph non-indexed exceptions; compensate with exact boundary contracts, full Vite build and published-asset verification.

## Final Preview evidence

- Candidate: `92141ec6cb385378579704a33c406630404ca04c`.
- PR #148: CI `verify` and `secrets` both succeeded; ordinary merge/deployed SHA `ae3ef9e30297183f741971c6d22cbece5fe62a12`.
- Canonical Preview-only workflow: `deploy-cloudflare-preview.yml`, run `30944747130`, success. Free/no-billing/Preview-only guards, full validation, Preview D1 migration step, Worker/static deploy and workflow verification all succeeded.
- Three complete cache-bypassing endpoint rounds converged: live, ready and meta all return public V5.8.1 and exact SHA `ae3ef9e3`, environment `preview`.
- Published CSS `/assets/index-B2nTDLq0.css`, stable SHA-256 `d3adb2d448d7c1a0ad5c7746bbb3cf8671002bf0d0121643346a45ec53ed0c66`; published JS `/assets/index-DwzSl5O_.js`, stable SHA-256 `db7ba9551daa49c34b1b7d09c35b8f390cb7ef48403492fa529b8c77d71008f0`.
- Compiled online viewport is exactly `position:fixed; top:90px; right:0; bottom:0; left:262px; overflow:hidden; contain:paint; isolation:isolate`; compiled wipe is `position:absolute; top:-8%; right:-10%; bottom:-8%; left:-10%`, never fixed.
- HSTS, strict CSP with `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, referrer policy, permissions policy and HTTP→HTTPS 308 passed.
- During first independent probing, cache-busting query parameters on immutable asset URLs intermittently triggered the SPA fallback HTML; no deployment was replayed. MIME-guarded direct hashed-asset probes were byte-stable and authoritative.
- Public version, Production and Production D1 were not changed. Visual acceptance remains human-only; prohibited browser fallbacks were not used.
