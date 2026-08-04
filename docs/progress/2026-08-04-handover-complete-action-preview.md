# Handover completion action — 2026-08-04

## Accepted behavior
- An unresolved **其它交接** card shows a black `完成交接` primary action after expansion.
- It calls the pre-existing `onHandoverComplete` → `workflow.completeHandover` flow.
- A completed handover remains visible for the current business day, with the primary action removed; existing next-day cleanup removes it.

## Implementation
- `PickupLedger` now accepts and forwards `onHandoverComplete` to each shared card.
- The shared primary action selects handover completion, repair completion, or pickup confirmation by card mode.
- Tests cover callback wiring, unresolved/complete state, and existing next-day cleanup contract.

## Delivery boundary
- Preview-only. No Production deployment or database/schema/API change.
