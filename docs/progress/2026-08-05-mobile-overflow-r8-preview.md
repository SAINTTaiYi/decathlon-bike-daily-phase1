# 2026-08-05 · Mobile overflow isolation R8

## Scope

- Ordinary phone only: suppress desktop reference table headers in Pending / Other / Repair.
- Ordinary phone only: suppress the desktop left-rail release card so it cannot render beneath the fixed five-item dock.
- Ordinary phone only: suppress the desktop Sales reference intro while retaining the established compact KPI summary and actions.
- Freeze the accepted >=768px 1536×1024 desktop canvas, left rail and right-business-region transition.
- Preview-only; public V5.8.1, Production and Production D1 remain unchanged.

## Gates

- CodeGraph pre-edit: 202 files / 2,380 nodes / 7,802 edges, up to date.
- CSS is a CodeGraph non-indexed exception; compensate with exact mobile-leak, desktop-restoration, desktop-freeze contracts and production build verification.

## Status

Implementation validated: full Domain / Database / Web / API / Worker suites, typecheck and all 88 workflow policies passed. Focused mobile-leak plus accepted-desktop freeze contracts passed 24/24. CodeGraph post-implementation is up to date at 203 files / 2,385 nodes / 7,807 edges. PR/CI and canonical Cloudflare Preview deployment pending.
