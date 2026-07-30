# Workshop Continuous Canvas Motion Specification

## Status and authority

This specification records the approved adaptation of the public `https://obsidianassembly.com/about` motion mechanics into the Workshop authenticated operations workspace. It supplements the project-wide `DESIGN.md`; it does not authorize copying Obsidian Assembly text, brand, fonts, images, logos, silhouettes, screenshots, or proprietary assets.

The former six independent full-height sticky stages, black covers, per-module three-line titles, and repeated curve/trail compositions are rejected and obsolete.

## Verified source mechanics

The cached public About implementation uses normalized continuous scroll values:

```text
progress = clamp((currentScroll - startPosition) / differencePosition, 0, 1)
```

Verified transferable mechanics include independent layer speeds, object scale and opposing translation, two-path curve offsets, distance-based seven-word focus, and deterministic transformed character reveal. Source evidence remains under `/data/data/com.termux/files/home/obsidian-motion-audit/` and `/data/data/com.termux/files/home/obsidianassembly-analysis/`.

## Approved Workshop composition

The authenticated workspace is one uninterrupted native-scroll canvas:

1. **Continuous warm field** — `#f7f5ef` remains dominant. A small number of ultra-long pale-gray and pale-yellow fields drift across several semantic modules and never align to module boundaries.
2. **Six persistent semantic modules** — KPI, Pickup, Other, Repair, Used, and Sales remain mounted, addressable, keyboard-focusable landmarks. They have no visible divider, chapter strip, independent cover, sticky pause, or module-level outer card.
3. **Spatial handoff** — adjacent modules may briefly coexist in the viewport. Whitespace, offset composition, depth, scale, and motion differences create natural separation without borders or section bands.
4. **Business content in motion** — headings, summaries, filters, statistics, and primary business groups translate and scale with continuous progress. Repeated records and necessary forms, drawers, and dialogs keep compact warm-white containers; nested cards are prohibited.
5. **Cross-module Workshop objects** — all six original transparent objects move through independent page-progress windows across multiple modules. They are not bound one-to-one to sections and do not restart at boundaries.
6. **Sparse narrative typography** — oversized display words appear only at two page-scale spatial moments and may cross two semantic modules. Module names use normal operational heading hierarchy.
7. **Sparse curve and word motifs** — curved copy and seven-word distance-focus trails each appear only twice across the complete page.
8. **Transparent navigation layers** — the fixed header is transparent/translucent and the six-item bottom dock is a lightweight translucent diffused layer, not a heavy opaque panel.

## Navigation and interaction

- Active module state changes when the incoming semantic anchor crosses approximately `42vh`.
- Directional hysteresis prevents dock and URL/history jitter during small reverse scrolls.
- Dock jumps and deep links target `#module-<id>` landmarks; business modules never unmount.
- Foreground objects use `pointer-events: none` and may create depth without obscuring controls, critical values, or substantial body text.
- On pointer or focus interaction, foreground objects retreat and the relevant business section settles to a stable target within `180–240ms`. Scrolling resumes the continuous parallax.
- The first-load reveal plays only for a normal top entry. Restored scroll positions, dock jumps, and deep links bypass it. Any keyboard, pointer, wheel, or touch input can skip it immediately.

## Runtime contract

- Native document scrolling only; no wheel/touch/PageUp/PageDown interception.
- No ScrollTrigger, pin spacer, sticky stage, scroll snap, `pinSpacing:false`, or content-size-driven scroll correction.
- One passive scroll listener scheduled through `requestAnimationFrame` writes one normalized page progress plus section-local progress values.
- Module geometry is derived from untransformed document offsets so visual transforms cannot feed back into progress calculation.
- Six object windows, two narrative windows, two curve paths, and two word trails use independent deterministic formulas.
- `prefers-reduced-motion` disables animated transforms, blur, sequencing, and foreground occlusion while preserving complete readable static content.
- Forced-colors removes nonessential spatial fields and foreground motifs while keeping semantic modules and controls intact.

## Mobile equivalence

Mobile is not a reduced-motion or reduced-layer variant.

- At `320–430px`, preserve the same animation intensity, depth, duration, layer count, object count, and narrative memory points as desktop.
- Portrait may use purpose-built diagonal or foreground/background trajectories instead of desktop horizontal geometry.
- No motif or business motion may be removed merely because the viewport is narrow.
- `390px` is a mandatory no-horizontal-overflow, readable-text, stable-hit-target, and full-business-interaction gate.
- Dynamic viewport and safe-area changes must not move a focused control out from under the user.

## Original asset policy

The six transparent Workshop-object SVGs are generated deterministically by `scripts/generate-workshop-stage-assets.mjs` and stored under `apps/web/public/images/ops/stages/`. They are project-authored illustrations with documented SHA-256 values. No external or Obsidian proprietary asset is copied, traced, hotlinked, or imitated.

## Acceptance gates

- Automated contracts verify a single continuous page progress, six mounted landmarks, 42vh active-state behavior, hysteresis, spatial overlap, six independent object windows, two sparse narrative/curve/trail motifs, interaction settling, entry bypass rules, and reduced-motion behavior.
- Mobile contracts and human verification cover `390px` with full-strength motion and no horizontal overflow.
- Full tests, typecheck, Web build, CodeGraph post-gate, PR CI, and protected Preview-only deployment must pass.
- Human Preview acceptance must verify visible depth separation in both scroll directions, stable controls, bottom-dock navigation, deep-link restoration, and reduced-motion behavior before any Production action.
