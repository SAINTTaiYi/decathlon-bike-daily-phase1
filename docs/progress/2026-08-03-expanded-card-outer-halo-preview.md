# Workshop Preview — expanded-card outer halo

## Clarified visual target

The requested visual is the **outside diffuse halo** visible around the `增加待取` button in the annotated mobile screenshot—not a light/gradient painted inside the yellow card. It must surround the whole expanded card, remain visible beyond its perimeter, and apply to both normal Pickup cards and RepairScene cards that share `PickupLedger`.

## Correction

- Removed the previous internal bloom treatment from the expanded-card surface.
- The card surface remains an exact opaque `#ffc31a` with no internal light painting.
- Added a high-specificity expanded `pickup-card-frame` halo: stacked `drop-shadow` layers plus a non-interactive, blurred `::after` aura that extends beyond the card perimeter.
- The effect is frame-level, so it remains outside card clipping and visually matches the surrounding soft halo language used by `增加待取`.
- It does not modify records, actions, notification state, repair completion, or the repair-to-pickup workflow. Reduced-motion keeps the halo but removes blur cost.

## Verification

- Pre-change direct CodeGraph entrypoint was current. CSS/Markdown remain explicit non-indexed exceptions; targeted CSS/UI tests cover this visual contract.
- The candidate will undergo full tests, typecheck, build and post-change CodeGraph before Preview-only deployment.
- Production and Production D1 are prohibited.
