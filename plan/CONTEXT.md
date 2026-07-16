# 压缩上下文事实源

更新时间：2026-07-17 04:26 +08:00

## Repository state

- 项目：`/workspace/decathlon-bike-daily-phase1`；私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted main：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- V5.3.0 release SHA：`89a60dd9d5db8432e22f865c86d89e915365dc3b`，已普通 push 到 `origin/develop` 并验证一致。
- Step12 `a77083447d6724bf1bf1e1e1722014fc70801ab6`；Step13 `bc062820e85430149d6cf5d6c593fbfd24302818`；Step14 implementation `8f462f2df58743210dea7f0a4ba4dd9c0657741d` / checkpoint `948fa5dc256a9f3cc3d0b1c68a2da294c7962681`。
- `staging` GitHub Environment ID `18164650072`，仅允许 `develop`。

## Architecture

- EdgeOne Makers Free：Vite/React Web + same-origin Node.js Cloud Functions。
- Supabase Free：PostgreSQL + private Storage。
- GitHub Free：private repo、CI/Gitleaks、migration-gated EdgeOne deployment branches。
- 禁止付费计划、按量计费、自动升级、force push；Production 禁止。

## Completed implementation

### Step 12

- Fetch → Fastify inject adapter、同源 `/api`/`health` wrappers、context env/clientIp。
- Supavisor transaction pooler，pool max 1、prepare false。
- `edgeone.json` Node22/pnpm9/API+Web build。

### Step 13

- Supabase private Storage adapter；server-only Secret。
- Object-scoped signed upload、5-minute signed download。
- Complete re-download + actual SHA-256 verification。
- Guarded private `bike-ops-media` migration。

### Step 14

- 删除 Railway/Cloudflare Pages/R2/bootstrap/Docker/infra state。
- Manual release sequence：quality gates → checksum migration → ordinary fast-forward deployment branch → EdgeOne Git deploy → exact release verify。
- Branches：`edgeone-staging`、`edgeone-production`；non-fast-forward/force push forbidden。
- EdgeOne build does not migrate DB；Staging has database-only bootstrap。
- Production requires accepted Staging, same source, approval, encrypted export, restore drill, Free/no-billing confirmation。
- Workflow governance 61/61。

### Step 15

- Version 5.3.0；268 versioned files。
- Node 22.22.2 / pnpm 9.15.9；offline frozen install passed。
- Tests 69/69：Domain 4、DB 2、Web/Ops 47、API 16。
- Typecheck/build/wrappers/frontend guards passed。
- Clean build embedded version 5.3.0 and SHA `89a60dd9d5db8432e22f865c86d89e915365dc3b`。
- Gitleaks 8.30.1：working tree 0；full history 16 commits 0。
- Ordinary develop push succeeded and verified；no cloud mutation。
- Receipt：`plan/receipts/step-15-free-stack-build-test-push.json`。

## Current platform facts

- Supabase Organization `SAINTTaiYi's Org` / `sctiyeyjvaezeofhysfq`；projects 0。
- Supabase MCP project cost：monthly amount 0。
- Supabase operational budget：500 MB DB、1 GB Storage、10 GB aggregate bandwidth（5 cached + 5 uncached）。
- Free inactive project may pause；Free 无满足本项目 Production 要求的托管日备份/PITR。
- EdgeOne Free：40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。

## Step 16 current state

- User confirmed Organization `sctiyeyjvaezeofhysfq`, cost 0元/月, Free boundary, and Singapore `ap-southeast-1`.
- Supabase Staging created: `bike-ops-staging` / ref `xrxmayzwxabmzanwhkmo` / `https://xrxmayzwxabmzanwhkmo.supabase.co`.
- Status `ACTIVE_HEALTHY`; organization remains Free; Production not approved/created.
- Actual database is PostgreSQL 17.6.1.141; all 3 repository checksum migrations applied.
- 15 bike_ops tables; private bike-ops-media bucket; migration history RLS deny-all; 14 FK covering indexes.
- Security Advisor ERROR count 0; only intentional no-policy INFO. Performance FK warnings 0; empty-db unused-index INFO remains.
- V5.3.1 security patch `eda86f8031aaa749009d0f7560bc719927353115`; GitHub CI `29391234924` success; 70/70 tests.
- No secret or publishable key is recorded in plan files.

- Supabase checkpoint `766d20db6a952e51a594d504ae240cca86ab5db2` passed GitHub CI `29391482691`.
- Ordinary `edgeone-staging` branch created at `766d20db6a952e51a594d504ae240cca86ab5db2`; force push=false.

## Guided configuration / recovery queue

- Step 16 was explicitly paused again by the user at 2026-07-17 03:14 +08:00 while the global Skill library is organized.
- Supabase project remains healthy; no EdgeOne project exists; no Production resource exists.
- Database password remains only in the user password manager.
- Session pooler template was copied, but a complete URI has not been confirmed as stored or configured.
- A mistaken Doppler entry was discarded unsaved; Doppler must not be used.

Recovery queue after the user resumes:

1. Use Supabase Connect to produce the full Session pooler URI privately.
2. Configure GitHub `staging` Environment Secret `MIGRATION_DATABASE_URL` directly.
3. Collect transaction-pooler and server-only runtime values, generate isolated runtime secrets.
4. Create/configure EdgeOne Free Staging and run full deploy verification.
5. Step17 full Staging acceptance.

## Skill library cleanup result

- Completed compact cleanup: 504 → 120 active; the 384 previously archived Skills were then permanently deleted at the user's explicit request.
- Pre-deletion archive hashes 384/384 passed; current active metadata 120/120 passed.
- Catalog: `/workspace/SKILLS-CATALOG.md`; deletion receipt: `/workspace/skill-archive/2026-07-17-compact/DELETION-RECEIPT.json`.
- Old installer/source/ZIP/report artifacts remain separately at `/workspace/skill-archive/2026-07-17-install-artifacts`.
- Step 16 remains paused until explicit user resume.

## Browser-control investigation

- Installed official `browser-harness` 0.1.5 and disabled telemetry. It cannot attach to the existing Android Chrome across the app sandbox. Temporary Browser Use Cloud sessions were stopped and local cloud auth was removed.
- Verified `ExTV/rikkahub-agent` commit `b4dae335293c4a4a3f31fb17d0a3535c78b4accb`, release `v2.4.1-agent.2`: separate APK `excp.rikkahub`, in-app AI-controlled WebView, per-tool Browser toggles, optional global Accessibility screen automation.
- Safest route for Step 16: install the agent fork side-by-side, restore an upstream RikkaHub backup if desired, enable only Browser plus the necessary browser write tools, keep `browser_eval_js` and global Accessibility off, and perform login/MFA/secret entry manually.
- APK has not been installed. Step 16 remains paused pending user choice.

## Anti-interruption / safety

- 每个可验证步骤更新 CHECKPOINT、CONTEXT、receipt、steps 和长期记忆。
- Secret 不进入聊天、仓库、日志或 artifact。
- 境外平台不可达时停止并提醒 VPN，不盲目重试。
- 当前无 Supabase/EdgeOne/Railway/Cloudflare Pages/R2 真实资源；Production 未创建。
