# Ark Endfield Overview + Pickup Refactor

## Contract

- Family: `endfield`
- Depth: `2 / moderate`
- Scope: authenticated Overview and Pickup only
- Primary task: assess live store work, prioritize pending pickup records, update notification state, and confirm pickup without obscuring business facts.

## Immutable boundaries

- Keep the React/Vite architecture, route/scene ownership, shared components, field order, data contracts, API calls, D1 schema, permissions, audit events, and operation handlers unchanged.
- Keep the existing pickup code validation and non-persistence behavior unchanged.
- Do not add Hypergryph, Endfield, Marathon, Bungie, bicycle, character, or proprietary assets or fonts.
- Do not add external media, continuous animation, scroll interception, fake telemetry, or decorative system codes.

## Implementation decisions

- The selected Endfield family is expressed with an original cold-white field surface, charcoal operational structure, Solar Yellow signal surfaces, squared geometry, clipped display bands, and one short hover feedback layer.
- Overview retains its real-data priority ordering and existing abstract signal field. Its core sales KPI is a charcoal decision surface with a Solar Yellow state plane. The business map remains a non-uniform map of actual unresolved work.
- Pickup retains its current source, notification, pickup-date, payment/warranty, completion, and delete behavior. The header, queue folio, ledger, primary action and pickup-code dialog receive the same Endfield family treatment.
- Labels, helper/error content, controls, entered values, keyboard behavior, focus, forced-colors and reduced-motion handling stay protected.

## Validation plan

1. Run the focused Ark scope test and all existing Web tests.
2. Run typecheck, production Web build, Worker typecheck and Worker bundle.
3. Restamp the version manifest after the final source and checkpoint documents are complete.
4. Run the existing frontend quality gate.
5. Use Browser Harness for desktop and portrait visual and interaction verification when available. Do not claim that verification if the Harness remains unavailable.

## Release boundary

This is a Preview-only visual candidate after local validation, normal PR and CI. Staging requires separate explicit user approval. Production is forbidden.
