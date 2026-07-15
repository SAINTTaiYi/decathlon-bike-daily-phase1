# 执行检查点

保存时间：2026-07-15 13:03 +08:00
当前阶段：Phase C / Step 10b、12、13、14、15 completed；Step 16 blocked on explicit zero-cost and region confirmation

## Accepted repository baseline

- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- `develop` V5.3.0 release SHA：`89a60dd9d5db8432e22f865c86d89e915365dc3b`，已普通 fast-forward push 并验证远端一致。
- Step 12：`a77083447d6724bf1bf1e1e1722014fc70801ab6`。
- Step 13：`bc062820e85430149d6cf5d6c593fbfd24302818`。
- Step 14 implementation：`8f462f2df58743210dea7f0a4ba4dd9c0657741d`；checkpoint：`948fa5dc256a9f3cc3d0b1c68a2da294c7962681`。
- `staging` GitHub Environment ID `18164650072`，custom deployment branch policy 仅允许 `develop`。

## Accepted architecture

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite/React static site
       └─ Node.js Cloud Functions · same-origin /api
            ├─ Supabase Free PostgreSQL
            └─ Supabase Free private Storage

GitHub Free
  ├─ private source / CI / Gitleaks
  └─ migrate first, then fast-forward EdgeOne deployment branch
```

约束：免费额度、无需外币信用卡、禁止付费套餐/按量计费/自动升级；Staging 与 Production 完全隔离；Production 继续禁止。

## Step 12 — EdgeOne Serverless runtime completed

- Fetch → Fastify inject adapter；不监听端口。
- 同源 `/api/*`、`/health/*` Cloud Function wrappers。
- EdgeOne context env/clientIp 进入 API 边界。
- Supavisor transaction pooler；默认 max 1、idle 5 秒、connect 15 秒、prepare false。
- `edgeone.json` 固定 Node 22.11.0、pnpm 9.15.9、API/Web build 和 `apps/web/dist`。

## Step 13 — Supabase private Storage completed

- server-only `SUPABASE_SECRET_KEY` 不进入浏览器。
- 对象级 signed upload、5 分钟 signed download。
- Complete 重新下载并计算真实 SHA-256。
- 10 MB、JPEG/PNG/WebP、每记录 6 张、审计、幂等和软删除。
- Guarded private bucket migration 已加入。

## Step 14 — Free deployment governance completed

- 删除旧 Railway/Cloudflare Pages/R2/bootstrap/Docker/infra-state 自动化。
- 仅保留 CI、manual Staging release、manual Production release。
- EdgeOne 专用分支：`edgeone-staging` / `edgeone-production`。
- 顺序：immutable source gate → tests/typecheck/build → checksum migration → ordinary fast-forward push → EdgeOne Git deploy → exact SHA/version/environment/database/Web verify。
- 禁止 force push；non-fast-forward fail closed；EdgeOne build 不迁移数据库。
- Staging 可 `database_only_bootstrap=true` 先建 schema/private bucket。
- Production 需要 accepted Staging、相同源码、审批、加密外部导出、恢复演练、Free/no-billing 确认。
- Governance 61/61。

## Step 15 — V5.3.0 build/test/push completed

- 版本：V5.2.10 → V5.3.0；release notes 4 项；service-worker cache `bike-ops-v5.3.0-static`。
- Version manifest：268 files，fingerprint 已登记。
- 官方 Node.js v22.22.2 linux-arm64 archive SHA-256 校验通过。
- pnpm 9.15.9；offline frozen install passed。
- Tests：Domain 4/4、Database 2/2、Web/Ops 47/47、API 16/16；总计 69/69。
- Typecheck：全部 TypeScript workspaces passed。
- Build：全部 buildable workspaces passed；EdgeOne wrappers import passed。
- Clean commit build metadata：version `5.3.0`、SHA `89a60dd9d5db8432e22f865c86d89e915365dc3b`。
- Gitleaks 8.30.1 linux-arm64 archive SHA-256 校验通过；working tree 0 findings；完整历史 16 commits 0 findings。
- 普通 push `develop` 成功；远端 SHA 与本地一致；无 force push。
- Receipt：`plan/receipts/step-15-free-stack-build-test-push.json`。
- 未创建或修改任何云资源。

## Step 16 — waiting for user confirmation

在创建 Supabase Free Staging Project 前，必须得到用户明确确认：

1. 当前 Supabase MCP 报价为 **0 元/月（monthly amount 0）**；用户理解免费额度/暂停/无 Production 备份 SLA 边界。
2. 选择 region；默认建议 **Singapore / `ap-southeast-1`**。

确认后顺序：

```text
create Supabase Free Staging project
→ collect runtime/migration values without exposing secrets
→ GitHub staging migration Secret
→ database-only bootstrap
→ create edgeone-staging branch
→ create/configure EdgeOne Makers Free Staging project
→ full deployment verification
```

EdgeOne 平台操作若当前网络不可达，停止并提醒开启 VPN；不盲目重试。

## Current free-tier boundary

- Supabase org `sctiyeyjvaezeofhysfq`；projects 0；project cost monthly amount 0。
- Supabase budget：500 MB DB、1 GB Storage、10 GB aggregate bandwidth（5 GB cached + 5 GB uncached）。
- Free inactive project may pause；Production 前必须实现加密外部导出并完成恢复演练。
- EdgeOne Free：40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。
- 70% quota 开始清理/归档；85% 冻结非必要附件上传；不自动升级。

## Safety

- 当前 Supabase projects 0；无 EdgeOne/Railway/Cloudflare Pages/R2 真实资源。
- 未配置真实 Secret、未部署 Staging、未创建 Production 资源。
- 不在聊天、仓库、日志或 artifact 中保存凭据。
- 无 force push、无历史改写。
