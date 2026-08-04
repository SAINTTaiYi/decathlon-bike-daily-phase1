# Workshop 1536×1024 reference pixel reconstruction — R2

## Scope
- Human rejected Preview `152e0eaf`: desktop reference cascade did not activate on the actual high-DPR desktop-mode viewport and the result did not resemble the five supplied boards.
- Rebuild only Preview: Overview, Pending, Other Handover, Repair and Sales Check. Real data/API/actions remain; phone UI remains below 768 CSS px; Production/D1/public version remain untouched.

## Decisions
- Author the workbench at the supplied 1536×1024 native coordinate system and scale the complete canvas with `zoom: calc(100vw / 1536px)` so physical proportions survive device DPR.
- Restore the reference's sixth Used navigation/page without visually redesigning that page; preserve all used-car KPI fields.
- Fixed geometry: 90px global header, 66px module bar, 262px left rail, 1536px board width; target pages are mutually exclusive on desktop/tablet.
- Add the missing left-rail release card and use the existing self-hosted type system and real components.

## Gates
- CodeGraph pre-edit initialized and synchronized: 197 files / 2,341 nodes / 7,749 edges, up to date.
- Post-edit tests, typecheck, workflow policy, build, CodeGraph and Preview evidence are pending.

## Verified implementation evidence
- Target contracts: 20/20 passed; complete Web regression: 147/147 passed.
- Domain 7/7, Database 10/10, API 21/21, Worker 28/28 passed.
- TypeScript typecheck passed across all six applicable workspace projects.
- Workflow policy validation passed: 5 workflows / 88 policies.
- Pre-registration build stopped only at the expected clean-commit Preview-registration guard; no compilation error occurred.
- CodeGraph post-edit: 197 files / 2,346 nodes / 7,723 edges, up to date.
- Explicit CodeGraph exceptions: CSS and Markdown are not indexed; compensated by source contracts, full regressions, typecheck, workflow policy, clean diff, and the pending registered production build.
