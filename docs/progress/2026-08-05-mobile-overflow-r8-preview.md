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

## Final Preview evidence

- Candidate: `b4866830537e6e94be9c27cce0d65e79d31b7c9e`.
- PR #152: `verify` and `secrets` passed; ordinary merge/deployed SHA `8b98bff6a06f6a4778f40f889e4a0a633296af67`.
- Canonical Preview-only workflow `deploy-cloudflare-preview.yml`: run `30948481922`, success. Free/no-billing/Preview-only guards, full validation, Preview D1 migration step and Worker/static deployment passed.
- Three cache-bypassing endpoint rounds returned V5.8.1 and exact SHA `8b98bff6…` from live, ready and meta.
- Published CSS `/assets/index-CvszzBVd.css`, SHA-256 `d22de2780d790664961076c7cca688a02b0b378f1a93f2be19a82d97200f9d14`; JS `/assets/index-COkscUMk.js`, SHA-256 `b8820d226e165959b760454ccf15cc68692b250b7b3edc7e4aefaa1f32d2b580`; both exactly match the locally validated build.
- Compiled CSS proves phone-default hiding of the ledger table header, dock release card and Sales reference intro; all three restore after the >=768px desktop breakpoint. Desktop 1536×1024 canvas and transition boundary remain top 90px / left 262px.
- HSTS, strict CSP, X-Frame-Options DENY, nosniff, referrer/permissions policies and HTTP→HTTPS 308 passed.
- Public V5.8.1, Production and Production D1 were not changed. Visual acceptance remains human-only; prohibited browser fallbacks were not used.
