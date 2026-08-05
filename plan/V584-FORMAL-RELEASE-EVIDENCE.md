# Workshop V5.8.4 Formal Production Release Evidence

- Version: V5.8.4
- Candidate: `28ae2026ffed13f4f443bad7fb6df0b66b814ff9`
- Ordinary merge/deployed SHA: `6be00eecc49f87bb7023f232d3d8b008dadd5afb` (PR #159)
- Canonical `deploy-cloudflare-staging.yml` run: `31004700239`
- Production target: `https://workshop.skin`

## Change

The native 1536 × 1024 desktop workbench fits by the smaller available viewport width/height ratio and is safely centered. Mobile, business, API, Worker, and database behavior are unchanged.

## Gates

Frozen install, full tests, typecheck, workflow policy, Production version check, build, and CodeGraph pre/post passed. CodeGraph finished at 207 indexed files, 2,436 nodes, 7,900 edges. CSS/Markdown are explicit non-indexed exceptions covered by contract tests, build, live probes, and exact asset comparison. No migration, API, Worker, or database code changed.

## D1 safety

Official read-only export bookmark `00000133-00000000-000050be-0a763d7ac12a6326efc285eb3ecb7101`; plaintext SHA-256 `8f957c3c8513236aa9704fc594e9e37fb84dd32ca73f75fe8af5d778e39d2845` before removal; encrypted SHA-256 `ecd2dd7b6f68f22a1b73c046cbf797afc6c1a1d5f016ead068daade51ed45c3b`. Isolated restore integrity passed with 0 FK violations, 23 tables, 748 rows, 7 migrations. AES-256-GCM roundtrip passed and plaintext was removed.

## Production verification

Three cache-bypassed live/ready/meta rounds returned V5.8.4 and exact SHA `6be00eecc49f87bb7023f232d3d8b008dadd5afb`. HTTP 308, HSTS, CSP, and DENY framing passed. Exact merge build matched deployed assets byte-for-byte: JS `3ed324dac073079839e28b06997e80c15a006fb347a21be546eae72109dec2d9`; CSS `ce1e0f7f100978ceab7cbb16017d69514894af103543d85a56a4da57c911b253`.
