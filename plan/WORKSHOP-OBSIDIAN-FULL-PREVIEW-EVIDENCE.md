# Workshop Obsidian Assembly Full Preview Evidence

## Scope

- All six Workshop modules were reconstructed from the local full analysis while preserving Workshop branding, real workflow data, all handlers, dialogs and accessible names.
- The Overview-to-Pickup boundary uses cached offset geometry and invariant shell/header sizing, removing the previous active-state layout feedback loop.
- The orange S trajectory remains visible only through empty areas at z-index 0; headings, photographs, cards and controls remain above it.
- Workspace loading uses four 25% transition bands, a central title and a 2.1s header pull-down.
- Five subsequent modules map to the documented Places, Objects, About, People and Policy composition families.

## Identity

- Local analysis SHA-256: `4ca33d2ce8bea9a2cd3af3d69674e269da2cb8b3ee3d131abe8e8bd1e8ac29b6`.
- Functional candidate: `6b695a8187540fed7ba09f2eb6cf379d19583a89`.
- Pull request: `#117`.
- Merged and deployed Preview source: `57827ee5ef6e07f8e3cf432792728fc2d10b102f`.
- Preview workflow run: `30636987984`.
- Cloudflare Worker Version: `63f95bc5-3e81-4eea-89bf-8e917a574df2`.
- Wrangler did not expose a separate Deployment ID in this run; run `30636987984` is the durable deployment identity.
- Public version remains `V5.7.9`.

## Gates

- Full repository tests, typecheck, 88 workflow policies, official build, asset integrity and bounded credential scan passed.
- Post-change CodeGraph: 197 files / 2,327 nodes / 7,808 edges, up to date. CSS, Markdown and WebP are explicit non-indexed exceptions covered by contract tests, build, readback and SHA verification.
- PR CI `verify` and `secrets` passed on exact candidate `6b695a8187540fed7ba09f2eb6cf379d19583a89`.
- Protected Preview workflow completed successfully with free-plan, no-billing and preview-only confirmations.
- Preview D1 migration stage passed; Production and Production D1 were untouched.

## Independent Live Verification

- `/health/live`, `/health/ready` and `/api/v1/meta/version` returned valid JSON envelopes, never an HTML error page.
- Live identity matched `57827ee5ef6e07f8e3cf432792728fc2d10b102f`, environment `preview` and version `5.7.9`.
- Web shell returned HTML 200 with HSTS, CSP, frame, MIME, referrer and permissions headers; plain HTTP redirected with 308.
- All three self-hosted CC0 material assets matched their recorded SHA-256 values.
- Browser-harness was unavailable, so visual motion acceptance remains the human Preview gate. No in-app browser or Android accessibility fallback was used.
