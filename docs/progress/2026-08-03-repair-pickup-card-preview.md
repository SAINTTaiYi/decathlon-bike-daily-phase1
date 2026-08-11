# Workshop Preview — Repair cards use the Pickup card module

## Requested scope

- Replace the Repair module's generic record-card presentation with the same Pickup card composition and interaction: expandable full-width card, shared search/sort/density/collapse tools, swipe-delete affordance, edit/history/more actions, and the existing measured-height reveal.
- Preserve repair records, repair-specific fields, and the existing **repair completion → pickup** data flow.
- Remove Repair's notification-state controls. In Repair mode neither `等待通知` nor `已通知` is rendered or actionable.
- The Repair primary action is `维修完成`.

## Implementation

- `RepairScene` now renders `PickupLedger` with explicit `repairMode` rather than `RecordLedger`.
- `PickupLedger` supports a repair-mode view without changing the Pickup mode. It uses separate search IDs/local-storage keys and repair labels/counts, carries repair contact/type/status/project fields, hides source filtering and notification controls, and changes only the primary label/callback.
- `onRepairComplete` remains wired to `completeRepairWithConfirmation`; that existing path performs the server-confirmed repair completion, then moves the completed repair record into Pickup. No repair workflow/data migration was changed.
- Repair completion uses the Pickup-card completion surface/timing so the replacement UI stays visually coherent; the deferred mutation is still finalized through the existing `onRepairPixelDissolveComplete` callback path.

## Validation

- Modification-before CodeGraph: direct v1.5.0 Node entrypoint indexed 191 files / 2,291 nodes / 7,709 edges, up to date.
- Targeted contracts passed: `repair-pickup-card-mode`, `pickup-ledger-ui`, `pickup-routing`.
- Full test and TypeScript typecheck passed in the gate task. The first build stopped only because the repository requires a clean committed candidate before `pnpm version:preview`; the new candidate will be registered, then full build and post-change CodeGraph rerun.
- Markdown is an explicit CodeGraph non-indexed exception. Production and Production D1 remain prohibited.
