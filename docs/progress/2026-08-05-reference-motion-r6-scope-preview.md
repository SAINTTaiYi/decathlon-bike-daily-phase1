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

## Pending

Registered Preview build, PR/CI, canonical Preview-only deploy and independent online verification. Production and Production D1 remain forbidden.
