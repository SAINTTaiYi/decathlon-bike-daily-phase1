# Font source

## Albert Sans Variable

- File: `albert-sans-variable.woff2`
- Upstream project asset: `nexu-io/open-design` landing-page public skill assets
- Typeface: Albert Sans
- License family: SIL Open Font License (OFL)
- Use: legacy local asset retained for historical builds; it is not part of the current runtime font stack

## Noto Sans SC Variable

- Package: `@fontsource-variable/noto-sans-sc@5.3.0`
- Typeface: Noto Sans SC Variable, weights 100–900
- License: SIL Open Font License 1.1; bundled as `noto-sans-sc/OFL-1.1.txt`
- Use: sole body and Simplified Chinese runtime family; unicode-range shards are bundled by Vite and fetched only for matching glyphs
- Runtime: fully self-hosted; `font-display: block`; no system or generic fallback and no third-party request
- Package license SHA-256: `18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3`
- Local CSS manifest SHA-256: `a2fe5734cb338d2bda3c3ca7fbc9d28b607f846f6e93582aba0f4abf1c8dcb2b`

## Noto Serif SC Variable

- Directory: `noto-serif-sc/`
- Upstream package: `@fontsource-variable/noto-serif-sc@5.2.10`
- Typeface: Noto Serif SC Variable v35
- Copyright holder: Google Inc.
- License: SIL Open Font License 1.1; bundled as `noto-serif-sc/OFL-1.1.txt`
- Use: local Simplified Chinese serif glyphs outside display titles; unicode-range shards load only when matching text appears
- Runtime: fully self-hosted; no Google Fonts or third-party font request

## Barlow Condensed 500 / 700

- Package: `@fontsource/barlow-condensed`
- Author: The Barlow Project Authors
- License: SIL Open Font License 1.1 (`OFL-Barlow.txt`)
- Files: `barlow-condensed-500.woff2`, `barlow-condensed-700.woff2`
- Purpose: Workshop mobile overview English headings and tabular operational numbers.
- Hosting: self-hosted; no remote font request.

## Noto Sans SC Operations Index Subset

- File: `noto-sans-sc-operations-index-subset.ttf`
- Upstream: Google Fonts CSS subset endpoint for `Noto Sans SC` 700, requested with text `业务台账` on 2026-07-29
- Typeface: Noto Sans SC
- License: SIL Open Font License 1.1 (`OFL-NotoSansCJK.txt`)
- SHA-256: `9b76d6fefcabfa935953071f34c0c4f314680a316935a94503a46728c05f7a70`
- Purpose: legacy subset retained for audit history; the current runtime uses Noto Sans SC Variable instead
- Hosting: self-hosted; no runtime request to Google Fonts or another third party
