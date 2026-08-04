# Workshop desktop reference motion R5 — Preview

## Scope

Desktop-only follow-up to the independently verified R4 Preview baseline `b69a6a5` / deployed source `f222f6c`:

- move every expanded Pickup / Other / Repair card action cluster to the far right;
- make the two Pickup notification controls compact and right-aligned;
- refine the fixed left navigation against the supplied 1536×1024 reference;
- replace abrupt page swaps with one bold branded diagonal wipe plus directional panel/header/component choreography;
- preserve mobile navigation, continuous document flow, public V5.8.1, Production and Production D1.

## Implementation checkpoint

- `apps/web/src/hooks/useDesktopSceneTransition.js`: desktop-only GSAP transition controller with scene-order direction, black-edged safety-yellow wipe, panel clip reveal, staggered component entrances, active-nav overshoot and `prefers-reduced-motion` immediate fallback.
- `apps/web/src/App.jsx`: routes desktop navigation through the transition controller while the mobile branch continues to call native `jumpTo`; adds the inert transition layer.
- `apps/web/src/components/lookbook/ActionDock.jsx`: desktop-only full reference labels (`待取车辆 / 其它交接 / 维修交接 / 二手台账 / 销售数据`); mobile still uses the existing compact labels.
- `apps/web/src/styles/desktop-workbench.css`: desktop rail/header divider correction; compact far-right actions and notification controls; transition layer and reduced-motion CSS.
- `tests/reference-desktop-motion-r5.test.mjs` and updated R3 contract: desktop scope, geometry, motion choreography and accessibility fallbacks.

## Gates

- Mandatory CodeGraph pre-edit gate: 199 files / 2,358 nodes / 7,773 edges, up to date.
- Focused source contracts: 17 passed, 0 failed.
- Full local suites passed: Domain 7, Database 10, Web 159, API 21, Worker 28; typecheck passed; 88 workflow policies passed.
- Post-resilience focused contracts: 17 passed, 0 failed; `git diff --check` passed.
- Post-change CodeGraph: 201 files / 2,375 nodes / 7,769 edges, up to date.
- CSS and Markdown are explicit CodeGraph non-indexed exceptions; compensate with exact CSS contracts, Vite build, mobile-path contract and final published-asset verification.

## Pending

Preview source registration/build, PR/CI, canonical Cloudflare Preview-only deployment and independent endpoint/asset verification.
