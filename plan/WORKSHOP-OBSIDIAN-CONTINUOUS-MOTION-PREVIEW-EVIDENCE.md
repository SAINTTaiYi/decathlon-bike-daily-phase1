# Workshop Obsidian Continuous Motion Preview Evidence

## Scope

- Overview, Pickup, Other, Repair, Used, and Sales are simultaneously mounted in one ordinary native vertical document.
- One orange S trajectory spans the complete document and advances from normalized scroll progress.
- The Overview obsidian mineral uses bounded opposing translation, rotation, and scale.
- Display text and module headings use deterministic Obsidian Assembly-style transformed-character reveal.
- Figure 2 Pickup and every workflow handler remain intact. The persistent dock remains removed.
- No scroll snap, sticky stage, ScrollTrigger, wheel/touch interception, public version change, Production deployment, or Production D1 operation occurred.

## Source and adaptation boundary

The implementation follows the mechanics documented in `plan/WORKSHOP-OBSIDIAN-PARALLAX-SPEC.md`: one passive requestAnimationFrame scroll loop, independent trajectory/object transforms, and deterministic character reveal. It does not copy Obsidian Assembly source, copy, branding, images, fonts, logos, silhouettes, or proprietary assets.

## Identity

- Functional candidate: `2f0eab3deef4bc32d60e64718fce5a31cfa230e7`
- Functional pull request: `#115`
- Functional CI run: `30632968046`
- Merged Preview source: `b0b0dee9afa43e062eeeaa4fed4a35ab568f1713`
- Protected Preview workflow run: `30633209140`
- Cloudflare Deployment: `22358518-d218-4c14-8376-3a0ac85c463f`
- Worker Version: `aa227ef5-43d9-4c52-bd76-b8636ec5187c` at 100%
- Preview URL: `https://bike-ops-preview.geeklightonefish.workers.dev`
- Public version remains `V5.7.9`.

## Gates

- Targeted continuous motion, 390px Overview, navigation, progress, and Figure 2 Pickup contracts passed.
- Frozen full repository tests passed: Web 129/129, API 21/21, Worker 28/28, plus domain and database suites.
- Repository typecheck, 88 workflow policies, exact-candidate Preview manifest, and official full build passed.
- CodeGraph v1.5.0 pre/post gates were synchronized and up to date. CSS and Markdown are explicit non-indexed exceptions covered by contract tests, diff checks, and the official build.
- GitHub PR checks `verify` and `secrets` passed; the latter ran verified Gitleaks 8.30.1 over complete Git history.
- Preview D1 reported no migrations to apply.

## Independent live verification

- `/health/live`, `/health/ready`, and `/api/v1/meta/version` returned valid JSON envelopes, never HTML error pages.
- Preview metadata matched `b0b0dee9afa43e062eeeaa4fed4a35ab568f1713`, environment `preview`, and app version `5.7.9`.
- Web shell returned `200 text/html` with HSTS, CSP, frame, MIME, referrer, and permissions headers.
- Plain HTTP redirected to HTTPS with 308.
- Obsidian asset SHA-256 remained `306c82097e6b912d2cc4da5a907a4d052ca330d532ed44ce3c546229f522e258`.
- Cloudflare deployment history independently matched Worker Version `aa227ef5-43d9-4c52-bd76-b8636ec5187c` to Deployment `22358518-d218-4c14-8376-3a0ac85c463f` at 100%.
- Browser-harness is unavailable in this environment, so visible motion quality remains a human Preview acceptance gate. No fallback to the in-app browser or Android accessibility was used.
