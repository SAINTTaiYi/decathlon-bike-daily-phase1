# Workshop Chrome MCP Acceptance Fix Checkpoint

更新时间：2026-07-30（本地时区）

## Baseline

- Branch: `fix/workshop-chrome-mcp-acceptance`
- Immutable administrative Preview baseline: `fe3940308dee3f496474aa38c041354c504cd889`
- Existing accepted Preview identity before this fix: `d1540c201fc3bd29b6461756272f7b14bc3dba5d`
- Existing Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`
- Public version remains `V5.7.9`.

## Real-browser findings

Official Chrome DevTools MCP v1.6.0 connected to Android Chrome 150 through ADB and stayed on the Preview origin. It found:

1. During a module handoff, the previous Repair contact fragment could remain visible at the beginning of Sales.
2. `index.html` still preloaded the removed `albert-sans-variable.woff2`, producing repeated console warnings.
3. Expanded release notes could begin beneath the fixed bottom dock.
4. Bidirectional PageDown/PageUp navigation worked, and the 1366×768 desktop document had no horizontal overflow.

## Implemented correction

- Story Scroll handoff now ends directly below the combined fixed header (`headerOffset() + 8px`).
- Dock/module jumps use the exact handoff end rather than reintroducing the former 25% viewport offset.
- The module stack reserves final header-height clearance so the last scene can complete its handoff.
- Opening release notes measures the live dock and header, then scrolls only when necessary; reduced-motion uses instant movement.
- Removed the obsolete Albert Sans preload.
- Closing-report canvas rendering now waits for only the two active self-hosted font families: `Noto Sans SC Variable` and `Barlow Condensed Ops`.
- Added source-contract regressions for all three findings.

## Verification

- Frozen offline install: passed.
- Focused acceptance tests: 26/26 passed.
- Complete Web regression: 124/124 passed.
- Root typecheck: passed.
- Web production build: passed.
- Workflow policy validation: 88/88 passed.
- `git diff --check`: passed.
- Runtime forbidden-font scan: no source/HTML/CSS reference; only historical provenance entries remain in `apps/web/public/fonts/SOURCES.md`.
- Post-change CodeGraph: up to date, 189 files / 2,273 nodes / 7,649 edges.

## CodeGraph coverage note

The draft source edits existed before the interrupted task was recovered, so this round does not claim a true pre-edit CodeGraph run. The immutable baseline and late-gate exception are recorded explicitly. CodeGraph found `App.jsx` as the sole runtime caller of `useStoryScroll`; its import graph identified `tests/closing-report-image.test.mjs`, while source-scanning contract tests and HTML/CSS assets remain explicit coverage exceptions.

## Safety and next step

- No Preview redeployment, Staging, Production, Production D1, version, route, API contract, permission or business-data mutation has occurred in this fix stage.
- Next: commit the verified source and evidence, register the unchanged-version Preview fingerprint, run the clean root build, open a PR, require Node 22 CI, and deploy only to Preview.

## Preview delivery evidence

- Functional source commit: `481367d0f1d4f705be51bb1c555125fed5bf8aa2`.
- Preview fingerprint: `a83fe4f52ecb67dbbe0c2da7684fc916d14eeee8d259325b1d8f1edf07b6872b` across 365 versioned files; public version unchanged at V5.7.9.
- PR: #98; Node 22 CI run `30478399915`, `secrets` and `verify` succeeded.
- Ordinary merge/deployed identity: `861e795773e3012912da45f9a9e35d15c63269e6`.
- Post-merge CI: `30478560899`, success.
- Protected Preview workflow: `30478746543`, success.
- Preview D1: no migrations to apply.
- Cloudflare Deployment: `e7efdcae-c93f-4588-84f7-284dc70baf8a`.
- Worker Version: `a965f15a-1e68-4a7f-845f-62701d8cd9c8`, 100% traffic.
- Public endpoint and security verification: passed for live, ready, version metadata, Web shell, 308 HTTPS redirect, HSTS, strict CSP, DENY, `nosniff`, permissions/referrer policy and API `no-store, private`.
- Online typography: 103 self-hosted font faces; zero forbidden system/generic declarations; zero Albert references in served HTML/CSS.

## Remaining acceptance blocker

The official Chrome DevTools MCP daemon is still running with the Preview URL allowlist, but `adb devices` is empty and `127.0.0.1:9222` is not available. One-time Android Wireless debugging reconnection is required before repeating the mobile Story Scroll, release-note dock clearance and console/network checks. No application browser or Android Accessibility fallback is permitted.
