# Workshop Overview — Figure 3 pixel specification

> Status: implementation source for the current Preview correction
> Reference raster: 852 × 1876 px
> Scope: Overview (`pulse`) only; five dedicated business modules and all business handlers remain unchanged

## Why the rejected Preview was structurally wrong

The previous candidate treated the reference raster as several normal web sections. A fixed 108 px shell header sat above four stacked surfaces (`970 + 285 + 590 + 180 px`), while KPI and workzone each introduced their own border and background. The result read as a hero module followed by a second large dashboard module. Figure 3 is instead one 852:1876 poster: every visual field shares the same warm paper, and the mineral, black plinth, KPI title, photographs and overview card overlap in one coordinate system.

## Coordinate model

All values below use the 852 × 1876 source raster. Runtime CSS converts them to percentages/cqw inside one `aspect-ratio: 852 / 1876` poster. At a 390 CSS-pixel viewport the poster is about 390 × 858 CSS px; device-pixel screenshots then reproduce the source proportions. Interactive hit regions expand independently where the source visual control is smaller than 44 CSS px.

| Element | Source bounds / anchor | Required effect |
| --- | --- | --- |
| Warm paper | x 0–852, y 0–1876 | One uninterrupted `#f7f5ef` field; no section bands |
| Brand | x 52–238, y 73–95 | Three cut bars plus one-line condensed label |
| Log/coordinate | center 352,84; copy x 383–516 | Crosshair-shaped real log action and coordinate copy |
| Menu | x 689–801, y 61–105 | Thin rounded visual outline; 44 px minimum hit region |
| WORKSHOP | x 49–478, y 192–324 | Large left-aligned condensed display line |
| OPS | x 51–208, y 340–471 | Second condensed line; no enclosing hero card |
| Status registration | dot (237,367), label x 235–330 y 418–440 | Orange hairline/dot, solid status label and microcopy |
| Date | x 721–788, y 251–365 | Right rail with hatch, DAY, orange month.day and weekday |
| Purpose | x 52–267, y 524–572 | Two Chinese lines on the shared paper |
| Guide curve | from (516,-24) through right arc to about (139,1298) | One thin orange path behind content |
| Mineral | x about 58–760, y 547–1078 | Transparent obsidian/orange asset overlaps both opening and plinth |
| Black plinth | y 773–1107 | Full-width angular black plane; not a section background |
| Left object note | x 56, y 862 | White condensed copy on plinth |
| Right object note | x 722, y 646 | Black right-aligned copy on paper |
| Today KPI | x 251–602, y 1087–1210 | Centered high-contrast serif heading and orange Chinese subtitle |
| Dashboard action | x 246–608, y 1263–1319 | One orange command, visually 56 source px high |
| Left workbench | x 0–228, y 1271–1724 | Edge-bleed photo with sloped top/bottom crop |
| Right workbench | x 624–852, y 1271–1724 | Mirrored crop and right-aligned label |
| Overview card | x 262–590, y 1354–1733 | One slightly darker warm card; four divider rows; no nested KPI cards |
| Footer marks | left x 52, center x 383–469, right x 723 | Tiny operational marks at y 1767–1825 |

## Layer order

1. warm paper;
2. orange guide curve and crosshair registration;
3. titles/date/purpose/right notes;
4. black plinth;
5. mineral above the plinth;
6. Today KPI title and command;
7. edge photographs;
8. central data card and real closing control;
9. footer marks and release disclosure.

No visual section may own an independent full-width background, top border, rounded outer container, shadow band or vertical whitespace separator.

## Runtime and data rules

- Date derives from `workflow.dateKey`.
- Four displayed values derive from workflow records/KPI/closing readiness; unavailable data renders `—`.
- Menu, log, KPI edit, close/history/refresh, reopen, export and photo navigation remain real handlers.
- The Overview remains static: no animation, transition, smooth scrolling, parallax, scale, viewport-driven transform or global canvas layer.
- 320–430 px preserves this exact composition. At 600+ it scales as the same poster; at 840+ it is capped at 852 px and centered rather than becoming a new dashboard grid.
- The persistent six-destination dock remains the application navigation layer; no duplicate five-link strip appears inside the poster.
