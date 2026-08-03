# Workshop Preview — login scroll restoration and target-locked navigation

## Scope

Preview-only V5.7.9 correction requested after human verification:

1. A successful credential login must open the Workshop at the document start, not restore a stale position at the final Sales module.
2. A dock navigation press must highlight the selected destination for the whole native smooth-scroll journey. Intermediate modules must not take the dock highlight while the page passes them.
3. A native scroll completion or a deliberate pointer/touch interruption releases that temporary lock and returns active-state selection to the actual viewport module. No wheel, touchmove, or keyboard scrolling is intercepted.

## Implementation

- `apps/web/src/App.jsx`: a credential-login-only `useLayoutEffect` temporarily forces `scroll-behavior: auto` and resets `window.scrollTo({ top: 0, left: 0, behavior: 'auto' })` synchronously and on the next frame. It is reset on logout and does not affect restored sessions.
- `apps/web/src/hooks/useActiveScene.js`: native `scrollIntoView` now creates an internal pending navigation target, sets its active scene before motion begins, and suppresses viewport-derived updates while it is pending. The lock releases on native `scrollend`, pointer/touch intent, or a bounded frame fallback when native `scrollend` is absent.
- `tests/active-scene-navigation-lock.test.mjs`: contract coverage for login reset, target lock, and non-interception constraints.

## Validation and exceptions

- Targeted navigation contract and existing `workspace-motion` contract pass.
- Full `pnpm test` and `pnpm typecheck` passed before the initial build stopped solely at the Preview manifest registration rule.
- CodeGraph v1.5.0 must be called by direct Node entrypoint on this device: `node ~/tools/codegraph-v1.5.0/dist/bin/codegraph.js`. The bare `codegraph` wrapper is not in `PATH`; this is not an installation failure.
- CodeGraph is rerun before commit/deployment. Markdown is a known non-indexed file-type exception; the source/test behavior is covered by CodeGraph and local tests.
- No Production deployment or Production D1 activity is permitted.
