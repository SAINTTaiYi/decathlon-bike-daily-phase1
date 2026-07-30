# Workshop Obsidian-derived Parallax Adaptation

## Status and authority

This specification records the approved adaptation of the public `https://obsidianassembly.com/about` motion and layout system into Workshop. It supplements the project-wide `DESIGN.md`; it does not authorize copying Obsidian Assembly text, brand, fonts, images, logos, or proprietary assets.

## Verified source mechanics

The cached public About implementation uses a normalized per-object scroll value:

```text
progress = clamp((currentScroll - startPosition) / differencePosition, 0, 1)
```

The page then applies that continuous value to independent depth layers:

- second title line: `translateY(progress * 10vh)`;
- third title line: `translateY(progress * 20vh)`;
- transparent foreground object: `scale(1 + progress * 0.2)`;
- map/background layer: `translateY(-20vh + progress * 40vh)`;
- repeated curve text: `startOffset = progress * 75%` and `-100% + progress * 75%`;
- seven-word trail: each word has a focus centre `t=(index+0.5)/7`; opacity/focus is derived from its distance to progress with a `0.25` fade window;
- oversized character reveal: 1.5s transformed entry with deterministic random-like 75ms character delays, initial scale/skew/translate/blur, and clear final state;
- line reveal: 1.5s clip/translate reveal with 75ms line staggering.

Source evidence is retained locally under `/data/data/com.termux/files/home/obsidian-motion-audit/` and `/data/data/com.termux/files/home/obsidianassembly-analysis/`.

## Workshop implementation contract

Every one of the six operational modules must have an independent full-height stage with all of these layers:

1. **moving material backdrop** — restrained project-owned workshop texture moving from `-20vh` to `+20vh`;
2. **oversized three-line title** — asymmetric grid placement with the second and third lines moving at 10vh and 20vh ranges;
3. **curved path copy** — two repeated text paths moving 75% across an original SVG curve;
4. **unique transparent foreground object** — one original self-hosted workshop illustration per module, scaling from 1 to 1.2 with a smaller opposing vertical shift;
5. **sequential trail** — seven operational words focusing in sequence as progress advances;
6. **viewport entry reveal** — deterministic per-character transformed reveal when the stage first enters view.

The stage is followed by the existing warm-white operational content. All business components remain mounted so local form and list state survives navigation.

## Runtime and safety requirements

- Native document scrolling only; no wheel, touch, PageUp/PageDown interception.
- No ScrollTrigger, pin spacer, `pinSpacing:false`, scroll snapping, or content-size-driven scroll correction.
- One passive scroll listener scheduled through `requestAnimationFrame` writes stage-scoped variables and SVG text-path offsets.
- Stage progress is calculated from the sticky runway travel distance, not from arbitrary time.
- `prefers-reduced-motion` disables depth movement, blur, transforms and sequential focusing while keeping every title and object visible.
- Fixed header and bottom dock remain usable; business content keeps dock clearance.
- At 320–430px widths, titles may reduce size but must not create horizontal scrolling.
- Runtime fonts remain the existing self-hosted `Noto Sans SC Variable` and `Barlow Condensed Ops`; reference-site fonts are not copied.

## Original asset policy

Six transparent workshop-object SVGs are generated deterministically by `scripts/generate-workshop-stage-assets.mjs` and stored under `apps/web/public/images/ops/stages/`. They are project-authored illustrations with no external source image or proprietary silhouette. Their SHA-256 values and purposes are generated into the local asset source record.

## Acceptance gates

- All six stages expose measurable progress values that change continuously while scrolling.
- Automated contracts verify all five moving visual layers, six distinct object assets, no prohibited scroll interception, reduced-motion behavior, stable anchors, and persistent module mounting.
- Full tests, typecheck, Web build, CodeGraph post-gate, PR CI and protected Preview deployment must pass.
- Human Preview acceptance must verify visible depth separation during both downward and upward scrolling before any Production action.
