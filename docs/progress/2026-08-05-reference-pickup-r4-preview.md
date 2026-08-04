# Workshop Pickup reference alignment R4

## Scope

Preview-only follow-up. The user's second 1536×1024 screenshot is the sole Pickup target. Public V5.8.1, business handlers, API contracts, Production and D1 remain unchanged.

## Changes

- Removed the inherited desktop section air so Pickup controls begin at the target vertical coordinate.
- Split the ledger into six real columns: queue, vehicle/business, contact, appointment, status and operation. Missing appointment dates render an explicit dash.
- Restored one continuous rounded border around every collapsed row, while keeping the inner card borderless so no isolated right-edge frame remains.
- Restored muted waiting-status pills and black repair-origin pills.
- Matched the target Pickup search placeholder.
- Replaced the inert release aside with a native details/summary card: the entire card and plus affordance open the same upward announcement panel.

## Gates

- CodeGraph pre-edit: 198 files / 2,351 nodes / 7,766 edges, up to date.
- Targeted contracts, full repository tests, typecheck, 88 workflow policies and post-change CodeGraph passed. Registered build, PR/CI, Preview deployment and online verification continue below.
- CSS/Markdown are explicit CodeGraph non-indexed exceptions compensated by source contracts and byte-verified build/deployment assets.
