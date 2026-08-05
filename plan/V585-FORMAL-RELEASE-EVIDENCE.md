# Workshop V5.8.5 Formal Production Release Evidence

- Version: V5.8.5
- Candidate: `recorded in PR`
- Ordinary merge/deployed SHA: `d2c47c7fb1bbd41d3d7ddbc56a9174e0d4c9d96a` (PR #161)
- Canonical `deploy-cloudflare-staging.yml` run: `31009292794`
- Production target: `https://workshop.skin`

## Responsive scope

All six desktop/tablet modules use native responsive reflow. The 768–1023px rail is icon-only; 1024px restores labels. Fixed top/side chrome frames an independently scrolling business region. Ordinary mobile below 768px is unchanged. Governed target classes: 768×1024, 1024×768, 1280×720, 1366×768, 1440×900, 1536×864, and 1920×1080.

## Browser validation waiver

The user explicitly accepted the higher risk of releasing without real browser-harness validation after local CDP was unavailable and Browser Use cloud returned HTTP 402 Payment Required. No in-app browser or Android accessibility fallback was used. Automated responsive contracts, full tests, typecheck, build, CI, online identity checks, and byte-level asset verification remained mandatory.

## Gates and D1 safety

Full automated gates, verify/secrets CI, and CodeGraph passed. CSS/Markdown remain explicit CodeGraph non-indexed exceptions covered by contract tests, build, and exact deployed assets. No migration, API, Worker, or database code changed. The most-recent encrypted D1 backup receipt remained valid: bookmark `00000133-00000000-000050be-0a763d7ac12a6326efc285eb3ecb7101`, plaintext SHA-256 `8f957c3c8513236aa9704fc594e9e37fb84dd32ca73f75fe8af5d778e39d2845` before removal, encrypted SHA-256 `ecd2dd7b6f68f22a1b73c046cbf797afc6c1a1d5f016ead068daade51ed45c3b`, isolated restore integrity OK, 0 FK violations, AES-256-GCM roundtrip passed.

## Production verification

Four consecutive exact rounds across both production domains returned V5.8.5 and SHA `d2c47c7fb1bbd41d3d7ddbc56a9174e0d4c9d96a`. HTTP 308, HSTS, CSP, and DENY framing passed. Exact merge build matched deployed assets byte-for-byte: JS `0fa55aa453021f81ced59811a4be141a09e292aaf23e5d3d2db5f1e5bc60ba7d`; CSS `bf7dc79461a55ab0a6d044fd1f904248422019aa2e27f5c08aaa84b8659c8da0`.
