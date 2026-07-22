# Font sources and runtime policy

All runtime fonts are self-hosted. No third-party font request is allowed. Font binaries enter the repository only after source, license and SHA-256 verification.

## Albert Sans Variable

- Runtime family: `Albert Sans Local`
- Source package: `@fontsource-variable/albert-sans@5.3.0`
- Package homepage: `https://fontsource.org/fonts/albert-sans`
- Package repository: Fontsource `font-files`, `fonts/variable/albert-sans`
- Package license: SIL Open Font License 1.1
- npm tarball SHA-256: `e58cf04e6c49037815a6c608c9961bb23195662eaa98c06cf8951d61b4b8ac28`
- npm integrity: `sha512-Uptsmb61n0fXHHqcdGyarvWAGlMd3UEEY3XjwV5gSZrcRxeM1MVKiTtsWhmWmPt4gYV2NWXyxYKu7llZ1Oz9wg==`
- Bundled subset: Latin and Latin-ext normal variable WOFF2, weights 100-900
- Files and individual hashes: `albert-sans/SHA256SUMS`
- Runtime role: Latin UI, operational numerals and data

## Barlow Condensed

- Runtime family: `Barlow Condensed Local`
- Source package: `@fontsource/barlow-condensed@5.3.0`
- Package homepage: `https://fontsource.org/fonts/barlow-condensed`
- Package repository: Fontsource `font-files`, `fonts/google/barlow-condensed`
- Package license: SIL Open Font License 1.1
- npm tarball SHA-256: `759fcdd25df64b4ef41653808d849cdb9ba0a520999032ceb137ce035a17e2ea`
- npm integrity: `sha512-RA7MmIx0v3eQ6Gcf74qLVLOwLB0GpPOzx+eU9iG/AmCnSJGcIWYeU8y6CEMGZ210MGwGg5CZhzLkkvyZdTTk1g==`
- Bundled subset: Latin normal weights 400, 700, 800 and 900 plus weight 900 italic
- Files and individual hashes: `barlow-condensed/SHA256SUMS`
- Runtime role: English module identities, large numbers/codes and display typography

## Noto Sans SC Variable

- Runtime family: `Noto Sans SC Variable`
- Source package: `@fontsource-variable/noto-sans-sc@5.3.0`
- Package homepage: `https://fontsource.org/fonts/noto-sans-sc`
- Package repository: Fontsource `font-files`, `fonts/variable/noto-sans-sc`
- Package license: SIL Open Font License 1.1
- npm tarball SHA-256: `3191e5a03a66f62d46064d1eabb6749366a5f2a142c0c901c59c69425c4d2f20`
- npm integrity: `sha512-lNar1dF7Ik/lHNPo/7JWG0TolXY29LtsqYgMvEysooZ5bsO9uH4shJmRrwyJ3PjyTPljhpMJEK0jDuLSU4vJ1w==`
- Bundled subset: all 101 Fontsource Unicode-range variable WOFF2 slices, weights 100-900
- CSS source adapted locally only to point at `/fonts/noto-sans-sc/`; Unicode ranges and font metadata remain unchanged
- Files and individual hashes: `noto-sans-sc/SHA256SUMS`
- Runtime role: Simplified Chinese UI and heavy display fallback

## Removed legacy asset

- The inactive `Noto Serif SC Variable` CSS and 101 WOFF2 files were removed with explicit user approval during Phase 1.
- Reason: the approved Signal Grid system is sans-serif; the old files were no longer imported but added 6,027,992 bytes to every public build.

## Intellectual-property boundary

No Marathon/Bungie proprietary font, logo, lettering or asset is included. All bundled font software remains under its upstream OFL-1.1 license.
