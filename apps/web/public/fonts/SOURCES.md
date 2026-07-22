# Font sources and runtime policy

## Albert Sans Variable

- File: `albert-sans/albert-sans-variable.woff2`
- Typeface upstream: Albert Sans, Google Fonts `ofl/albertsans`
- Inherited project asset source: `nexu-io/open-design` public landing-page skill assets
- License: SIL Open Font License 1.1
- Bundled license: `albert-sans/OFL-1.1.txt`
- SHA-256: `685123f02baf3d077e46af89c765789e47ae9e6a4a873ddccfe713f3a189eac1`
- Runtime role: self-hosted Latin UI, operational numerals and current safe display fallback
- Loading: `font-display: swap`; no third-party runtime request

## WORKSHOP SIGNAL GRID target typography

- Latin module display candidate: Barlow Condensed or an equivalent OFL-licensed condensed sans.
- Chinese display/UI candidate: Noto Sans SC / Source Han Sans SC under SIL OFL.
- Current Phase 1 network state prevented retrieving and checksum-verifying those official binaries. They are not referenced as active runtime families until verified self-hosted files are bundled; production-safe fallbacks are Albert Sans plus the platform CJK sans stack.
- No Marathon/Bungie proprietary font, logo or lettering asset is used.
- Official font binaries must not be added until their source, license and SHA-256 are recorded here.

## Legacy Noto Serif SC Variable

- Directory: `noto-serif-sc/`
- Upstream package: `@fontsource-variable/noto-serif-sc@5.2.10`
- License: SIL Open Font License 1.1
- Bundled license: `noto-serif-sc/OFL-1.1.txt`
- Status: retained as a legacy repository asset but no longer imported by the Signal Grid runtime because the approved system uses sans-serif CJK typography.
