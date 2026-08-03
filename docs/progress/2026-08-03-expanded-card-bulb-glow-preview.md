# Workshop Preview — diffuse bulb light on every expanded card

## Human feedback and diagnosis

The authenticated Preview screenshot showed the expanded yellow card as a flat opaque fill: the prior expanded-state treatment preserved the required exact `#ffc31a` surface but did not create a sufficiently perceptible diffuse light source on mobile Chrome.

## Correction

- The final high-specificity selector `.pickup-ledger .pickup-card[data-expanded='true']` applies to **every expanded card** in the shared PickupLedger, including normal Pickup cards and RepairScene's `repairMode` cards.
- It keeps the fully opaque bright-yellow base while adding two local radial light pools, stronger multi-layer amber exterior glow, and a focused pale-yellow/white bulb bloom through `::before`.
- Card content is explicitly layered above the bloom, so text/actions remain legible and interactive. The pseudo-element has no pointer events.
- Reduced-motion preserves the visual treatment while removing its blur cost. No data, action, notification, or repair-to-pickup workflow behavior changed.

## Validation

- Pre-change CodeGraph used the direct local v1.5.0 Node entrypoint; it was up-to-date.
- Targeted CSS/UI contracts cover the high-specificity expanded-card selector, radial bulbs, exterior glow, content layering and reduced-motion rule.
- A clean Preview candidate will receive full test/typecheck/build and post-change CodeGraph before Preview-only delivery. Production and Production D1 remain prohibited.
