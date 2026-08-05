# Real seven-day business trends · Preview plan and evidence

Status: implementation candidate; Preview-only. Production and the public version remain unchanged.

## Data contract

- Window: seven consecutive natural dates ending on the authenticated store's current business date.
- Sales: `daily_closings.sales_vehicles`; a value is available only when `sales_saved_at` is set. Missing/unsaved dates remain `null`, while a saved zero remains a real zero.
- Repair pressure: daily `audit_events` with `audit_module='repair'` and `action='add-record'`, excluding events referenced by an undo event. Queries are store-scoped.
- Existing indexes are sufficient: the unique `(store_id, business_date)` index on `daily_closings` and `audit_events_store_module_date_created_idx`. No D1 migration or aggregate table is needed for this seven-day window.

## Lieflat template audit

Official source: `larashero3-dotcom/lieflat-charts`, audited commit `e5b369de1d0d32637093ee62d60bd556cf2c1af4`.

- Selected sales: F2 Hairline Line, `templates/basics-gallery.html`, card “Thirty days of sign-ups”. It preserves one calendar position per natural day, supports honest points and line segments, and allows missing dates to remain hollow and disconnected.
- Selected repair: F1 Rung Bars, `templates/basics-gallery.html`, card “Revenue by plan, rung by rung”. One visible rung maps to exactly one new repair order, so the visual contract is countable.
- Rejected L3 Barcode Lollipop: designed for roughly 90 days; seven values cannot support its editorial density.
- Rejected F3 Hairline Area: intended for 30–60 day shape reading; filling a seven-day series with missing sales would imply continuous volume that the data does not establish.
- Glance was not considered because both Lupi Basics templates honestly fit the data. The implementation retains the selected SVG geometry, unit encoding, hairline/rung language, reveal/replay motion and reduced-motion fallback while using Workshop's self-hosted typography.

## Coverage

- Worker unit tests: date gap filling, saved zero vs missing, store isolation, repair intake, and undo exclusion.
- Web contracts: real bootstrap wiring, no hard-coded dates/fake points, F1/F2 template signatures, accessible SVGs, honest units and reduced-motion fallback.
- Existing desktop/mobile freeze contracts remain mandatory. The analytics DOM stays desktop-only.

## Preview deployment and acceptance evidence

- Candidate source: `3d60f8c860740361b530e973c71eb03211bb1810`; PR #156 merged normally as `9747dd2774b17abc5050a55d20f6d57595e777c5` after CI `verify` and `secrets` succeeded.
- Canonical Preview workflow: `deploy-cloudflare-preview.yml`, run `30994615001`, success. Free-plan, no-billing and Preview-only confirmations were enforced.
- Preview URL: <https://bike-ops-preview.geeklightonefish.workers.dev>. Three cache-bypassed rounds of `/health/live`, `/health/ready` and `/api/v1/meta/version` returned public V5.8.2 and deployment identity `9747dd2774b17abc5050a55d20f6d57595e777c5`. Deployed JavaScript contains the F2 Hairline Line and F1 Rung Bars signatures.
- Human acceptance: the user explicitly replied “通过” on 2026-08-05. This accepts the Preview only; it does not authorize Production or a public version change.
- Production, `workshop.skin`, and production D1 were not touched.
- Browser visual automation exception: the required browser-harness CLI was unavailable on this device, so no application-browser or Android-accessibility fallback was used.
- CodeGraph was run before and after this evidence-only change. Markdown is not indexed; this is an explicit coverage exception compensated by exact Git, Actions, HTTP, deployed-asset and human-acceptance evidence.
