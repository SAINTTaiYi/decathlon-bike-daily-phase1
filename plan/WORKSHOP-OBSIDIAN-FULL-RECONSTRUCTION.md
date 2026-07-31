# Workshop Obsidian Assembly Full Reconstruction

## Baseline
- Local analysis: `/storage/emulated/0/Download/ObsidianAssembly-Analysis/REPORT.md`
- SHA-256: `4ca33d2ce8bea9a2cd3af3d69674e269da2cb8b3ee3d131abe8e8bd1e8ac29b6`
- Boundary: published CSS, rendered HTML and runtime inventory; no proprietary source code or asset is copied.

## Implemented
- Four 25% transition bands, central title and 2.1s header pull-down on workspace load.
- Native document scrolling; ResizeObserver owns geometry measurement and passive RAF writes cached local progress only.
- Overview remains the Workshop poster. Pickup, Other, Repair, Used and Sales map to Places, Objects, About, People and Policy composition families.
- Character reveal uses 1.5s, 75ms deterministic stagger, scale 2, blur and skew(15deg,30deg).
- S trajectory is z-index 0; headings/business content are z-index 4+, with opaque action surfaces.
- Shell/header/module geometry is invariant across active-scene changes, removing the Overview-to-Pickup feedback loop.
- Reduced-motion makes all stages finite and static.

## Validation
Targeted contracts, full tests, typecheck, workflow policy, Vite build, post-CodeGraph, bounded secret scan, candidate CI and Protected Preview-only deployment. Public V5.7.9 and Production remain unchanged.

- Final frozen gates: full repository tests, typecheck, 88 workflow policies, official Web build, CC0 asset integrity and bounded credential scan passed. Post-change CodeGraph: 197 files / 2,327 nodes / 7,808 edges, up to date.
