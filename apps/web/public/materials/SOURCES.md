# WORKSHOP SIGNAL GRID — External Material Provenance

**Revision:** V5.8.8 Preview-material pass
**Retrieved:** 2026-07-24
**Scope:** authenticated Overview + Repair only
**Storage policy:** the deployment ships only reduced WebP derivatives in this directory. Full originals remain local, ignored source material and are not committed or deployed.

## Use and safety rules

- These are physical-print ingredients, not hero illustrations: each is clipped, low-opacity, monochrome/duotone-treated by CSS, and subordinate to the white operational surface.
- No bicycle, person, logo, brand mark, proprietary Marathon/Bungie asset, or original source layout is used.
- No source title or label is intentionally presented as UI content. Material is confined to non-interactive display/header/ledger-frame zones.
- Labels, field names, help/error text, controls, entered values, and touch targets remain on clean opaque layers above the material.
- `prefers-reduced-motion` and `forced-colors` retain their existing non-material fallbacks.

## Verified sources and shipped derivatives

| ID | Source / licence | Retrieved original SHA-256 | Shipped WebP derivatives and SHA-256 | Exact use |
|---|---|---|---|---|
| M01 | Wellcome Collection, *Civil engineering: construction drawings for the Thames Embankment* (`V0024387`), **Public Domain Mark**. IIIF: `https://iiif.wellcomecollection.org/image/V0024387/info.json` | `933147e5399e23355803c3eaba2c063a88068196e7067f0e840e8d32e7656883` | `wsg-overview-engineering-480.webp` `7b32fbaf0b4c739c5ab2e291cb06d648ed9ca48cebb6638fca0b1b53bacc71b2`; `wsg-overview-engineering-800.webp` `cbbd4cab2123ef5c18d460e2aa4b8bcfa015f00e066f52be5b32eb4551bed2b5` | Overview display-zone linework only |
| M02 | Wellcome Collection, *Engineering: a safety valve* (`V0024661`), **Public Domain Mark**. IIIF: `https://iiif.wellcomecollection.org/image/V0024661/info.json` | `e780aa36a93f440718f22fe34075316fd53c8a0c834ac66276b992a3355805d6` | `wsg-repair-valve-480.webp` `379eb669c50097f6999bceb25feef25848eab6dc7f2994726160642c2b3a2ca4`; `wsg-repair-valve-800.webp` `2b23835d715a74c98cc38cf9c0c12f466f53b900ca3da16dfeb3e5b791e6c52c` | Repair display-header fragment only |
| M04 | Wellcome Collection, *Clymer and Dixon's patent Columbian printing press* (`V0024667`), **Public Domain Mark**. IIIF: `https://iiif.wellcomecollection.org/image/V0024667/info.json` | `34dab5d7990afe96269c842433796a0527c2e03b0f9c09bb4faa3d5177b5a17a` | `wsg-ledger-press-320.webp` `194e8a1c44fc50cf59009b1cae84ef59ac95d68955bf400cd3c4d488e50b5352`; `wsg-ledger-press-480.webp` `040c113befbfa52df13ad29414062e6e7b3ce8654bf53f9ddca389934a9d9eda` | Repair ledger header/frame fragment only |
| M06 | Openverse / Flickr, *photocopy-texture-1* (`45970b3d-d3ee-4fd8-8045-ba3ce515f304`) by christy.sparks, **CC0 1.0**. Record: `https://api.openverse.org/v1/images/45970b3d-d3ee-4fd8-8045-ba3ce515f304/` | `27a0fefe46230ac63aa8975520e2c7e9e98dd11757e914f1b63c9c4f88511fe8` | `wsg-toner-breakup-480.webp` `2e10a826170ec82c532d2d7db62b9caa180173e7664af381b9dc74cc88da76b3`; `wsg-toner-breakup-960.webp` `4f62bd196d1e8abbe2ba47459bf9a5a2e9736873965058237df8251a820751ba` | Abstract signal-field toner breakup only |
| M08 | Openverse / Flickr, *paper texture with holes* (`669982d9-354e-4639-a693-7256c3802ce3`) by lisafree54, **CC0 1.0**. Record: `https://api.openverse.org/v1/images/669982d9-354e-4639-a693-7256c3802ce3/` | `179709216b927206bfdf0de4f4b850d4bf581ddbb37c1847699ec6d57263b5b0` | `wsg-torn-edge-320.webp` `a85074ba20f7553834b4b6c384d6752d6e5994720ec2bbe68fab2658e5fa8bd2`; `wsg-torn-edge-640.webp` `faf13d56a15e063dacfd7e5bd658a24d2b57405d515708c4eae146942278a266` | Non-interactive abstract-field edge abrasion only |
| M11 | ambientCG, `Paper006`, **CC0**. Asset: `https://ambientcg.com/a/Paper006`; 1K source archive: `https://ambientcg.com/get?file=Paper006_1K-JPG.zip` | archive `cd21850eb598b374f16c4ff2eaf2e22d8b56e0fe0b4b94d83db807a928bfce57`; extracted colour map `7e8c8940b7d6bd4896c29f5cdbccd08eb6014099860ac1d863ec09b289bac51e` | `wsg-paper-fibre-480.webp` `7366326086d0dfa945699efb6033eace9ba5d130ccc43360fc9aaee8bbb8a9cc`; `wsg-paper-fibre-960.webp` `50da704b411b39f0182c4d6276844b503c1f559986486da7002ebc01f7d5aba3` | Faint cool paper fibre in Overview/Repair display zones only |

## Optimisation record

All derivatives are lossy WebP, generated locally with `cwebp` at quality 48–58 after targeted crop/resize. The twelve deployed derivatives total **365,660 bytes**. They intentionally omit original metadata; the table above is the provenance record. Source dimensions and licences were checked against the Wellcome, Openverse, and ambientCG APIs before retrieval.
