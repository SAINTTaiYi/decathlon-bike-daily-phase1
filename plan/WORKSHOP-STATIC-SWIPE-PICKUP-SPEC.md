# Static scene navigation and Figure 2 Pickup specification

> Reference: user Figure 2, 852 × 1839 px
> Scope: remove persistent dock and vertical continuous-scene navigation; add static swipe entry cards; rebuild Pickup page without animation

## Architecture

- Exactly one scene is mounted at a time. Scroll position never selects a scene.
- Scene state is URL-hash addressable (`#module-…`) and browser history remains usable.
- Scene changes use immediate state replacement and `window.scrollTo({ top: 0, behavior: 'auto' })`; there is no transform, transition or smooth-scroll page effect.
- The persistent six-item `ActionDock` and runtime `ContinuousCanvas` are not mounted.
- Overview left workbench card accepts a right swipe to Repair; the right card accepts a left swipe to Pickup. A 48 CSS-pixel horizontal threshold prevents accidental activation during vertical page scrolling. Click and keyboard activation remain available.

## Figure 2 coordinates

| Region | Reference bounds | Implementation |
| --- | --- | --- |
| Header identity | y 126–313 | Existing real menu/log handlers; brand/version; right module identity plaque |
| Pickup chapter line | x 38–298, y 326–357 | Delivery icon, `02 / 06`, `待取车辆` |
| Mineral hero | x 0–546, y 395–731 | Existing licensed self-hosted obsidian/orange asset; no fabricated business image |
| Queue status | x 537–792, y 417–564 | Real waiting count and picked-today count |
| Orange guide | from about (654,307) to (281,651) | One static SVG path and registration crosshair |
| Tool surface | x 23–821, y 646–778 | Search plus filter, sort, density and collapse; all real controls |
| Active summary | x 27–821, y 808–898 | Real visible count, operation history and add-record command |
| Collapsed card | x 24–823, y 931–1142 | Sequence, title, source, status, contact, date |
| Expanded card | x 24–823, y 1153–1648 | Warm-orange single card with customer/service/notice/action regions |
| Bottom dock | y 1672–1821 | Removed by requirement; content owns the bottom space |

## Data and interaction rules

- Queue totals derive from `records`; no reference phone, title, ticket or date is copied.
- Search, source filtering, sort, density, collapse, add, edit, history, notification and pickup confirmation remain wired to existing handlers.
- The first useful expanded state defaults to the second waiting record when available, matching Figure 2 hierarchy without inventing content.
- No IntersectionObserver entry animation, pixel-fill animation, transform transition, sticky auto-hide tool motion, parallax or page transition is permitted.
- Mobile 320–430 px is primary. The content rail caps at 852 px on larger viewports; tablet/desktop keep the same reading order with wider card internals only.
