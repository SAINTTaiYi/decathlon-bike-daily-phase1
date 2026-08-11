# Workshop ordinary-mobile recovery R7 — Preview

## Reported regression

Ordinary phone Chrome with desktop-site mode OFF showed a broken mixed UI: desktop search/notification/user controls expanded the fixed header, desktop-only trend/data-health markup rendered without phone styles, content overflowed, and the release strip collided behind the bottom dock.

## Root cause

JavaScript correctly identified the viewport as mobile (five-item dock and no Used destination proved this). Two desktop increments leaked into the phone DOM/cascade:

1. `.workshop-header-desktop-tools` had no mobile-default `display:none`, so the desktop search, notification and user menu occupied the third phone grid track and overflowed vertically/horizontally.
2. `OverviewAnalytics` was rendered unconditionally although its trend and health styling exists only in `desktop-workbench.css` under `min-width:768px`.

## Recovery

- Restore a dedicated compact phone log button and default-hide desktop header tools.
- Restore phone menu/module icon sizes (21px/20px); reassert accepted desktop sizes (28px/26px) only in the desktop workbench media block.
- Pass `showAnalytics={desktopLayout}` and render `OverviewAnalytics` only when true, matching existing `showUsed={desktopLayout}` governance.
- Preserve five mobile destinations, continuous native vertical flow, fixed bottom dock and mobile release strip.
- Freeze the accepted R6 desktop workbench and right-region transition boundary.

## Gates

- Mandatory CodeGraph pre-edit: 201 files / 2,375 nodes / 7,797 edges, up to date.
- Full local suites passed: Domain 7, Database 10, Web 165, API 21, Worker 28; typecheck passed; 88 workflow policies passed.
- Focused mobile recovery + mobile overview + R6 desktop freeze + workspace motion contracts: 24 passed, 0 failed.
- `git diff --check`: passed.
- CSS/Markdown are CodeGraph non-indexed exceptions; compensate with exact mobile/desktop source contracts, full build and published-asset checks.

## Final Preview evidence

- Candidate: `fbf8a3f3c03cd1906cc3fc923393f5e08a1e4fb2`.
- PR #150: CI `verify` and `secrets` both succeeded; ordinary merge/deployed SHA `7559375027beb55cecf3fd20d1a40b2b7e8d9ab6`.
- Canonical Preview-only workflow: `deploy-cloudflare-preview.yml`, run `30946664084`, success. Free/no-billing/Preview-only guards, full validation, Preview D1 migration step, Worker/static deploy and workflow verification all succeeded.
- Three complete cache-bypassing endpoint rounds returned public V5.8.1 and exact SHA `75593750` from live, ready and meta.
- Published CSS `/assets/index-DTtGaPvM.css`, stable SHA-256 `603cd86e7195b6c9eb6ae80623e0b7627c9ad9e4eddf87bd912531343c2a1fda`; JS `/assets/index-BTIPddc0.js`, stable SHA-256 `b8820d226e165959b760454ccf15cc68692b250b7b3edc7e4aefaa1f32d2b580`.
- Compiled online contracts confirm phone default `.workshop-header-desktop-tools{display:none}`, phone log `display:grid`, five-column dock, desktop tools `display:flex`, desktop-scene viewport still top 90 / left 262, and JS desktop analytics gating.
- HSTS, strict CSP, X-Frame-Options DENY, nosniff, referrer/permissions policies and HTTP→HTTPS 308 passed.
- Initial post-deploy JS hash request briefly returned SPA fallback HTML during edge convergence; no deployment replay occurred. Subsequent direct immutable CSS/JS probes were MIME-correct and byte-stable across three rounds.
- Public V5.8.1, Production and Production D1 were not changed. Visual acceptance remains human-only; prohibited browser fallbacks were not used.
