# Workshop Project Design Baseline

> Status: current and authoritative
> Effective date: 2026-07-29
> Accepted reference implementation: Workshop authenticated overview
> Preview identity: `b3a3413006381115653b0bae942c9a6927f195f1`

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

The interface is an operations product, not a marketing page, portfolio, game HUD, cinematic scene, or imitation of another brand.

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
3. Do not introduce gradients, neon colors, blue accents, decorative multicolor systems, glass effects, or colored background bands.
4. Semantic green and red must never replace labels, icons, or accessible state text.
5. New colors require a documented semantic role and must be added here before use.
6. The pickup expanded-card orange is a contextual focus surface only; it must not become a general status color or decorative band.

## Typography

### Families

- Operational English labels, dates, version marks, and large numbers: self-hosted `Barlow Condensed Ops` 500/700.
- Simplified Chinese and general body content: self-hosted `Noto Sans SC Variable` 100–900.
- The `业务台账` label uses the same self-hosted Noto Sans SC family, visually compressed to align with `OPERATIONS INDEX`.
- Runtime UI text may use only `Noto Sans SC Variable` or `Barlow Condensed Ops`; system fonts and generic font-family fallbacks are prohibited.

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

- The mobile content rail is centered with a maximum overview width of `390px` inside an app shell up to `426px`.
- Primary module corners use `8px` radius. Avoid larger pill-like cards.
- Cards must not be nested inside decorative cards. Use one surface per functional module.
- Major modules use the restrained card shadow. Identity rows, navigation, and lightweight strips should remain flat unless elevation communicates interaction.
- Internal organization relies on spacing, background contrast, type hierarchy, and alignment. Do not restore decorative divider grids, title rules, or repeated borders.
- Black controls and yellow primary actions may use `8px` radius and subtle edge diffusion.
- Icon-only actions require accessible labels and at least `44px` hit targets.
- Stable grids, fixed metric lanes, and explicit min/max dimensions must prevent layout shifts when values change.

## Information Architecture

The accepted overview establishes the priority order:

1. Product identity, version, business date, and notifications.
2. Current store, user identity, and menu.
3. Daily closing status and the single next action.
4. Sales vehicle total and supporting sales KPIs.
5. Operations index for Pickup, Other, Repair, and Sales; used-car sale/acquisition remain sales KPIs only.
6. Pickup work queue.
7. Release information.
8. Persistent five-destination navigation (Overview, Pending, Other, Repair, Sales); used-car metrics remain under Sales.

Apply the same principle elsewhere: current decision first, supporting evidence second, history and configuration later. Avoid landing-page heroes, decorative introductions, feature explanations, and oversized editorial headings inside work surfaces.

## Controls And Interaction

- Use familiar icons from the installed icon library for tools and destinations.
- Use text or icon-plus-text buttons only for explicit commands.
- Use toggles and checkboxes for binary settings, segmented controls for modes, selects or menus for option sets, and proper fields for numeric input.
- Primary actions are yellow when they advance the active task. Black is used for structural or menu actions. Secondary actions remain flat and low emphasis.
- Active navigation uses black background, yellow icon/text emphasis, and clear Chinese plus compact English labels.
- Press feedback may use a small opacity change and `scale(.985)`; it must not move surrounding layout.
- Motion is short and functional. Respect `prefers-reduced-motion`; never require animation to understand state.
- Loading, offline, empty, error, permission, and synchronization states must be explicit. Unknown data must render as unavailable, not as a false zero.

## Responsive Behavior

### Mobile

- Mobile is the primary composition.
- Support at least `320px` through `430px` widths without horizontal scrolling.
- Preserve safe areas and dynamic viewport bottom offsets.
- Keep the six-item navigation fixed and ensure content can scroll fully above it.
- At narrow widths, reduce secondary metadata before reducing touch targets or primary values.

### Tablet

- At `600px` and above, increase page padding and available media width while preserving the same reading order.
- Navigation may float with the accepted `8px` radius but must remain operationally dense.

### Desktop

- At `1024px` and above, use the reference workbench: fixed 90px global header, 262px left rail, 66px module bar, and one selected board in the remaining field.
- Overview uses a 5/7 closing-to-sales row, full-width four-operation index, then an 8/4 trend-and-health row; Pending, Other, and Repair use a full-width ledger table.
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

- Prefer real operational content and project-owned, brand-neutral assets.
- The bicycle workshop blueprint is the accepted restrained technical motif. It must remain secondary to business data.
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

## Workshop module navigation

Mobile keeps the normal document flow. At 1024px and above, the reference workbench uses a fixed left rail and displays one selected work board at a time: Overview, Pending, Other, Repair, Sales. The independent Used module and /used route are retired; /used redirects to Overview. Used-car sale and acquisition remain real KPI fields in Overview and Sales. The desktop rail must not rotate, scale, stack, or animate between boards; mobile continues to use ordinary vertical scrolling and reduced-motion-safe navigation.
