# Workshop Preview — handover uses Pickup card design

## Confirmed scope

- The **其它 / 交接事项** module uses the shared PickupLedger card composition: expandable cards, search/sort/density/collapse controls, shared exterior halo, and edit/history/delete affordances.
- The handover editor contains exactly two user-editable controls:
  1. required multiline **交接事项**;
  2. **当前状态** select containing exactly **继续跟进** and **已处理**.
- Legacy 事项名称、交接说明、分类/位置/关联信息 are not rendered. Existing legacy `meta` is retained invisibly on edit to avoid data loss; the one visible handover text maps into the existing title/detail model for API compatibility.
- Handover does not gain a separate completion action. Users mark it 已处理 through the status selector.

## Implementation

- `OpeningScene` renders `PickupLedger` in explicit `handoverMode` rather than the generic `RecordLedger`.
- `PickupLedger` has a handover presentation branch: handover labels, unique local-storage/search keys, no contact/notification/collection UI, no primary completion button, status-focused expanded details, and the same shared card shell/halo as Pickup and Repair.
- `RecordEditorDialog` has a handover form branch with the two explicit status choices. It preserves legacy metadata while keeping the old API payload shape.

## Validation

- Pre-change CodeGraph direct entrypoint indexed 192 files / 2,295 nodes / 7,705 edges and was up to date. A pre-existing local edit in `operationsData.js` was inspected; it is the approved `formKind: 'handover'` plus two explicit status values and is included in this candidate.
- Targeted Handover, Pickup, Repair and card-style contracts pass.
- Full test/typecheck/build and post-change CodeGraph must complete before Preview-only deployment. Markdown remains a CodeGraph non-indexed exception; Production and Production D1 are prohibited.
