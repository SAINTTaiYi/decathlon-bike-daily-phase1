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

## Pending

Registered Preview build, post-CodeGraph, PR/CI, canonical Preview-only deployment and independent online verification. Public V5.8.1, Production and Production D1 remain unchanged.
