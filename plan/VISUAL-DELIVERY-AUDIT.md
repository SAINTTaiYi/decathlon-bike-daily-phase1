# Visual Delivery Audit

> Record type: historical delivery evidence only
> Active design authority: [`DESIGN.md`](../DESIGN.md)
> Last updated: 2026-07-29

This file preserves identifiers needed for release accounting, CI verification, deployment traceability, and incident review. It is not a visual specification and must not be used to infer current colors, typography, geometry, components, or interaction behavior.

## Superseded implementation records

| Date | Identity | Verification fact |
| --- | --- | --- |
| 2026-07-24 | `a6a608c31448c4524b6d1413650f976af059cb8d` | Historical presentation implementation; tests, typecheck, workflow policies, build, Cloudflare typecheck, and Worker bundle passed at that checkpoint. |
| 2026-07-25 | `13e01afd809fd84c4524b6d1413650f976af059cb8d` | Historical desktop presentation implementation; local tests, typecheck, workflow policies, build, and CodeGraph passed. |
| 2026-07-25 | PR #62, merge `7fcefeb3364cc884e3ff39dda6118176f8e89653` | PR CI `30149114857` and post-merge CI `30149165649` passed. |
| 2026-07-28 | `c4ed931c7a93d3c1904adb94124ee274383eb8a5` | Historical documentation checkpoint; superseded and removed from the active tree. |
| 2026-07-28 | `6b794bcdeb5264b8b9a0a614e2a1e9a8d0dbd264` | Historical overview implementation checkpoint. |
| 2026-07-29 | `35f8e29b3d93e1d389b814fcb5cf87a4c72a2aaf` | Historical overview correction checkpoint. |

The records above remain available in Git history for audit only. They have no design authority after 2026-07-29.

## Accepted overview delivery chain

| PR | Implementation | Merge identity | CI / deployment evidence |
| --- | --- | --- | --- |
| #81 | `00f9cb0b89eac25de1c460eb4cac6f134011d220` | `6f4658ddaafa19dd7866a354742a3d1b6f397b50` | PR CI `30402662562`; Preview run `30402838084`; Worker Version `3071a75f-56e9-4fec-8c87-de035683db69`. |
| #83 | `c2278c3664448f7d720a1d85cbec11da06e66269` | `3251287495d2667b96488afc3c20845c0d5c7728` | PR CI `30405450967`; Preview run `30405639734`; Worker Version `f2b5e4e1-e43f-4aa3-8d08-7d90e94082b1`. |
| #85 | `125f8847ca872bd2215b1b104259abecece9a5f8` | `45dd09c870c93d7346124b23372fe4006e651e48` | PR CI `30407320185`; Preview run `30407523441`; Worker Version `791fd681-5305-4ce8-874b-25265e80420c`. |
| #87 | `d458f0eb2d99e57c3939fb0928a07431a5f26fb8` | `b3a3413006381115653b0bae942c9a6927f195f1` | PR CI `30409523057`; Preview run `30409674057`; Worker Version `5fbde315-d488-4ea6-b9c8-34623d91cea2`. |
| #88 | `3132c25f5fef1c424b625bab5b84a58470d93887` | `8c39315136f5b4c021fb6eaa92880aff1580d118` | Evidence CI `30409941316`; post-merge CI `30410113721`. No second deployment. |

## Current accepted Preview

- URL: `https://bike-ops-preview.geeklightonefish.workers.dev`
- Public version: V5.7.9
- Source identity: `b3a3413006381115653b0bae942c9a6927f195f1`
- Worker Version: `5fbde315-d488-4ea6-b9c8-34623d91cea2`
- Independent `live`, `ready`, and `meta` checks matched the source identity.
- User acceptance: explicit acceptance recorded on 2026-07-29.
- Production and Production D1 were not modified by this delivery chain.

## Asset receipts retained for audit

- Self-hosted operations-label font subset: 2,428 bytes.
- Font SHA-256: `9b76d6fefcabfa935953071f34c0c4f314680a316935a94503a46728c05f7a70`.
- Asset source and license remain documented in `apps/web/public/fonts/SOURCES.md`.
- Project-owned workshop blueprint source remains documented in `apps/web/public/images/ops/SOURCES.md`.
