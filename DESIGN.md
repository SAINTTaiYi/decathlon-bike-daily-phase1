# Workshop Project Design Baseline

> Status: candidate branch, pending Preview acceptance
> Candidate date: 2026-07-31
> Production baseline: V5.7.9; administrative candidate baseline `69743619ce55796c5683eeb77a96fdfbf1205630`
> Candidate implementation: Figure 3 normalized 852 x 1876 single-field industrial-poster Overview; rejected stacked-section Preview superseded
> Preview identity: pending

## Authority

This file is the only active visual-design source of truth for the project. Every new page, dialog, form, report, navigation surface, responsive layout, and visual refactor must use this baseline.

Historical design documents, generated-image measurements, previous visual directions, and superseded specifications are obsolete. Git history and audit receipts may retain delivery facts, but they do not define current design behavior. When code and this document differ, treat the accepted overview implementation as evidence, reconcile deliberately, and update this file in the same change.

Primary implementation references:

- `apps/web/src/components/overview/WorkshopOverviewPage.jsx`
- `apps/web/src/styles/mobile-overview.css`
- `apps/web/src/components/lookbook/ActionDock.jsx`
- `apps/web/src/styles/index.css`
- `apps/web/public/fonts/SOURCES.md`
- `apps/web/public/images/ops/SOURCES.md`

## Product Character

The project is a warm, high-contrast workshop operations ledger. It should feel practical, mechanical, immediate, and trustworthy without becoming decorative or theatrical.

The visual hierarchy combines:

- warm paper-like page and card surfaces;
- dense operational information arranged for repeated daily use;
- condensed English labels and numbers for scanning;
- clear Simplified Chinese for decisions and actions;
- black for structure and primary controls;
- signal yellow for progress, state, numbering, current navigation, and primary action;
- green and red only for semantic success and failure.

The interface is an operations product rebuilt with the documented Obsidian Assembly motion grammar, not its proprietary brand, text, code, or assets. Overview retains the normalized 852:1876 Workshop poster field and real data. All six business modules remain mounted in one native document and share a stable 6/12-column composition, sticky material stages, progress-driven masks, deterministic character reveals, and one background trajectory. The reconstruction must preserve every live workflow, handler, accessible name, and 44px action target.

## Color System

The accepted overview palette defines the project baseline.

| Token | Value | Required use |
| --- | --- | --- |
| `--ops-page` | `#f7f5ef` | App background and fixed navigation background |
| `--ops-card` | `#fffdf8` | Main modules, dialogs, forms, sheets, and raised work surfaces |
| `--ops-black` | `#0c0e0c` | Primary controls, active navigation, high-emphasis structure |
| `--ops-text` | `#0a0b0a` | Primary text |
| `--ops-text-muted` | `#55554f` | Secondary explanations and metadata |
| `--ops-text-inverse` | `#fffdf8` | Text on black controls |
| `--ops-yellow` | `#ffc31a` | Primary action, progress, current state, numbering, active navigation |
| `--ops-orange` | `#ff6a00` | Static Overview poster cut face, registration lines, and poster commands only |
| `--ops-yellow-pressed` | `#e7a900` | Yellow pressed state and stronger warning emphasis |
| `--ops-yellow-glow` | `rgb(255 195 26 / .32)` | Restrained yellow edge diffusion |
| `--ops-pickup-expanded` | `#fff1dc` | Low-emphasis warm orange fill for the single expanded Pending Pickup card |
| `--ops-black-glow` | `rgb(12 14 12 / .22)` | Restrained black edge diffusion on major elements |
| `--ops-card-shadow` | `0 5px 18px rgb(64 55 34 / .055)` | Soft elevation for major modules only |
| `--ops-danger` | `#c63b2e` | Errors, failed synchronization, destructive warnings |
| `--ops-success` | `#17613c` | Completed, ready, or closed semantic state |

Rules:

1. Warm off-white must remain the dominant field; do not turn the interface into a black or yellow theme.
2. Yellow is a signal, not decoration. Use it for one primary action or one dominant status per decision area.
3. Do not introduce gradients, neon colors, blue accents, decorative multicolor systems, or glass effects. The authenticated workspace may use a small number of ultra-long pale-gray and pale-yellow spatial fields that cross multiple semantic modules; they must remain subordinate to the warm off-white page and must never become section bands or visible dividers.
4. Semantic green and red must never replace labels, icons, or accessible state text.
5. New colors require a documented semantic role and must be added here before use.
6. The pickup expanded-card orange is a contextual focus surface only; it must not become a general status color or decorative band.

## Typography

### Families

- Operational English labels, dates, version marks, and large numbers: self-hosted `Barlow Condensed Ops` 500/700.
- Simplified Chinese and general body content: self-hosted `Noto Sans SC Variable` 100–900.
- The Figure 3 Overview `Today KPI` display line alone uses the self-hosted Noto Serif SC Latin variable subset under the local alias `Figure 3 Serif`; the historical global serif stylesheet remains disabled.
- The `业务台账` label uses the same self-hosted Noto Sans SC family, visually compressed to align with `OPERATIONS INDEX`.
- Runtime UI text may use `Noto Sans SC Variable` or `Barlow Condensed Ops`; the single Figure 3 `Today KPI` line may use the local `Figure 3 Serif` subset. System fonts and generic font-family fallbacks are prohibited.

All font assets must be self-hosted, licensed, documented in `apps/web/public/fonts/SOURCES.md`, and loaded without runtime third-party requests.

### Hierarchy

- Large numbers carry the strongest visual weight in KPI and progress surfaces.
- Chinese action titles are direct and readable; English labels classify the module but do not replace Chinese meaning.
- Use condensed uppercase English for short operational labels only.
- Body text remains compact, high contrast, and unglowed.
- Do not use viewport-width font scaling. Use explicit responsive sizes and stable line heights.
- Letter spacing is `0` by default. Small positive tracking is allowed only for short uppercase metadata where the accepted implementation already uses it.

### Text effects

- Yellow glow is limited to yellow status numbers, selected icons, and primary yellow controls.
- Black glow is limited to major headings, large numbers, major icons, and black controls.
- Small body copy, form labels, help text, error details, and table content must remain crisp without glow.

## Geometry And Surfaces

- The mobile business rail is centered and readable at `390px`; the continuous spatial canvas may span the viewport, while business controls remain inside stable safe-area-aware bounds.
- Primary module corners use `8px` radius. Avoid larger pill-like cards.
- Cards must not be nested inside decorative cards. Use one surface per functional module.
- Major modules use the restrained card shadow. Identity rows, navigation, and lightweight strips should remain flat unless elevation communicates interaction.
- Internal organization relies on spacing, background contrast, type hierarchy, and alignment. Do not restore decorative divider grids, title rules, or repeated borders.
- Black controls and yellow primary actions may use `8px` radius and subtle edge diffusion.
- Icon-only actions require accessible labels and at least `44px` hit targets.
- Stable grids, fixed metric lanes, and explicit min/max dimensions must prevent layout shifts when values change.

## Information Architecture

The candidate reference-structured overview establishes the priority order:

1. Product identity, version, business date, and notifications.
2. Current store, user identity, and menu.
3. Daily closing status and the single next action.
4. Sales vehicle total and supporting sales KPIs.
5. Operations index for Pickup, Other, Repair, Used, and Sales.
6. Pickup work queue.
7. Release information.
8. Persistent six-destination navigation.

Overview, Pickup, Other, Repair, Used, and Sales form one native vertical document of six full-bleed material scenes. Every scene owns a sticky 100dvh image field derived from the documented Admission, Places, Objects, About, People, and Policy composition families; images touch both viewport edges with no poster gutter or separate content block. Titles, counters, filters, ledgers, records, KPI values, and actions are dismantled into independent semantic instruments inside the image field. Use local dark or warm translucent plates only where text or controls need contrast; never restore a page-sized white module below the image. The single S trajectory remains below readable components. No persistent navigation dock is allowed.

Apply the same principle elsewhere: current decision first, supporting evidence second, history and configuration later. Avoid landing-page heroes, decorative introductions, feature explanations, and oversized editorial headings inside work surfaces.

## Controls And Interaction

- Use familiar icons from the installed icon library for tools and destinations.
- Use text or icon-plus-text buttons only for explicit commands.
- Use toggles and checkboxes for binary settings, segmented controls for modes, selects or menus for option sets, and proper fields for numeric input.
- Primary actions are yellow when they advance the active task. Black is used for structural or menu actions. Secondary actions remain flat and low emphasis.
- Active navigation uses black background, yellow icon/text emphasis, and clear Chinese plus compact English labels.
- Press feedback may use a small opacity change and `scale(.985)`; it must not move surrounding layout.
- The authenticated workspace uses ordinary native vertical scrolling with all six modules mounted. Sticky full-bleed material stages convert scroll distance directly into local progress without smoothing, scroll snap, wheel/touch interception, or ScrollTrigger. Progress begins as the next scene enters the lower 82% of the viewport and active identity crosses at 62%, so mobile hand movement and visual replacement stay coupled rather than lagging above the finger. A passive requestAnimationFrame renderer reads only cached geometry; ResizeObserver owns layout measurement. Four 25% transition bands, a central title, header pull-down, character reveals, clip wipes, bounded transforms, and 0.6/0.9/1.5/2.1s timing tokens follow the local Obsidian Assembly analysis. `prefers-reduced-motion` makes every stage finite and static.
- Loading, offline, empty, error, permission, and synchronization states must be explicit. Unknown data must render as unavailable, not as a false zero.

### Figure 2 Pickup

- Source geometry is 852 × 1839: identity header, chapter marker, mineral/queue Hero, floating tool surface, active summary, then one-column cards.
- Queue totals, record content and states always come from real workflow records. Never copy reference phone numbers, ticket numbers, dates or vehicle names.
- The tool surface keeps real search, filter, sort, density and collapse controls.
- The second waiting record is the default expanded example when available; fewer records fall back to the first.
- Cards, tool surfaces and completion feedback are static in this phase: no IntersectionObserver entry reveal, auto-hiding tools, pixel-fill animation, gradient glow or transition.
- Full details are governed by `plan/WORKSHOP-STATIC-SWIPE-PICKUP-SPEC.md`.

## Responsive Behavior

### Mobile

- Mobile is the primary composition.
- Support at least `320px` through `430px` widths without horizontal scrolling.
- Preserve safe areas and dynamic viewport bottom offsets.
- Do not render a persistent navigation dock. Scene entry is contextual: Overview edge cards, each business page brand/home control, and existing menu routes.
- The former 852:1876 Overview poster boundary is retired. Every scene fills the viewport width and uses a 100dvh sticky image stage inside a bounded native-scroll runway; no left/right page seam is allowed. Interactive hit regions remain at least 44px, and overlaid controls use viewport-safe clamps plus explicit mobile/tablet/desktop rearrangement.
- At narrow widths, reduce secondary metadata before reducing touch targets, primary values, or motion strength.

### Tablet

- At `600px` and above, increase page padding and available media width while preserving the same reading order. Figure 2 Pickup keeps one vertical ledger rail capped at 852px.
- The fixed shell header uses a warm-white-to-transparent vertical gradient, preserves real menu/log actions, and must not terminate as an opaque bar over the scene. Navigation may float with the accepted `8px` radius but must remain operationally dense.

### Desktop

- At `840px` and above, use a stable 12-column work grid.
- Closing and sales surfaces may share a row; supporting modules use full-width or balanced columns according to task density.
- At `1200px` and above, the operations index and pickup board may share the row.
- Desktop is a wider workbench, not a different visual theme. Do not revive obsolete desktop-specific art directions.

## Accessibility

The minimum baseline is WCAG 2.1 AA:

- semantic HTML and meaningful heading order;
- keyboard access to every command;
- visible `:focus-visible` treatment using the signal yellow;
- minimum `44px` interactive targets;
- native dialog behavior, Escape handling, focus trapping, and focus restoration;
- `aria-live` for meaningful async state changes;
- explicit loading, error, empty, offline, and permission states;
- `prefers-reduced-motion` and forced-colors fallbacks;
- text alternatives for informative imagery and empty alt text for purely decorative assets;
- no state conveyed by color alone.

## Asset Policy

- Prefer real operational content and project-owned, brand-neutral assets. The candidate Overview also uses documented public-domain/CC0 photography from Wikimedia Commons, converted to responsive self-hosted WebP files and integrity-pinned in `apps/web/public/images/ops/SOURCES.md`.
- The bicycle workshop blueprint remains the restrained technical motif. The documented obsidian specimen is a decorative material object and the documented mechanic workbench photograph is a contextual Workshop-space background; neither represents a product, employee, store, or live record. It must remain secondary to business data.
- Do not copy proprietary logos, screenshots, character art, fonts, or visual assets from other products.
- Do not hotlink production assets. Self-host, compress, document source, license, purpose, and SHA-256 where applicable.
- Do not simulate irregular material texture with noisy CSS or generated ornament when it does not improve task comprehension.

## Migration Rules For Existing Screens

This baseline governs the full project immediately, but this documentation change does not itself restyle every existing screen.

When modifying an existing screen:

1. Preserve routes, business rules, API contracts, permissions, audit semantics, data states, and event handlers.
2. Replace obsolete visual tokens and presentation with this baseline in the touched scope.
3. Keep mobile behavior first, then provide tablet and desktop rearrangement.
4. Remove obsolete style layers only after regression coverage confirms equivalent behavior.
5. Validate long Chinese labels, maximum values, empty/error/offline states, keyboard flow, reduced motion, and forced colors.
6. Update this file only when the accepted project-wide baseline itself changes.

## Governance

- `DESIGN.md` is the sole active design specification.
- `PRODUCT.md` defines product and business truth; it must link here rather than duplicate visual direction.
- Plans, journals, release notes, and Preview receipts may record historical facts but must not define an alternative visual system.
- Any proposal to change the project-wide palette, typography, surface geometry, navigation model, or interaction language requires explicit user approval and a Preview acceptance cycle.
- Preview-only design changes do not increment the public version. Production remains a separate, explicitly approved release action.
