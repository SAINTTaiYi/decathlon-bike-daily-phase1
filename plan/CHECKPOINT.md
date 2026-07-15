# 执行检查点

保存时间：2026-07-15 12:50 +08:00
当前阶段：Phase C / Step 10b、12、13、14 completed；Step 15 版本化全量验证与普通 push pending

## Accepted repository baseline

- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 远端 `develop` SHA：`a492fdb1e42b0dacce49ee27b4e426a3d584fa06`。
- Step 12：`a77083447d6724bf1bf1e1e1722014fc70801ab6`。
- Step 13：`bc062820e85430149d6cf5d6c593fbfd24302818`。
- Step 14 implementation：`8f462f2df58743210dea7f0a4ba4dd9c0657741d`。
- 当前 develop 相对 origin/develop ahead 3；Step 15 前不得 push 未验证版本。
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
- Receipt：`plan/receipts/step-12-edgeone-serverless-runtime.json`。

## Step 13 — Supabase private Storage completed

- 删除 R2 adapter/tests；server-only `SUPABASE_SECRET_KEY` 不进入浏览器。
- 对象级 signed upload、5 分钟 signed download。
- Complete 重新下载并计算真实 SHA-256。
- 保留 10 MB、JPEG/PNG/WebP、每记录 6 张、审计、幂等和软删除。
- Guarded private bucket migration 已加入。
- Receipt：`plan/receipts/step-13-supabase-private-storage.json`。

## Step 14 — Free deployment governance completed

- 删除旧 bootstrap workflow、Railway/Cloudflare/R2 ops、Docker/railway config、infra state 和旧 provider Secret 清单。
- 仅保留 CI、manual Staging release、manual Production release 三个 workflow。
- EdgeOne 项目不监听 `develop`/`main`；专用部署分支 `edgeone-staging` / `edgeone-production`。
- 安全顺序：immutable source gate → tests/typecheck/build → checksum migration → ordinary fast-forward push → EdgeOne Git deployment → exact SHA/version/environment/database/Web verify。
- 部署分支禁止 force push；non-fast-forward fail closed。
- EdgeOne build 不修改数据库；migration-only URL 只进 GitHub Environment，不进 EdgeOne runtime。
- Staging `database_only_bootstrap=true` 可先迁移 schema/private bucket，再创建 EdgeOne project。
- Production 门禁增加加密外部导出、恢复演练、accepted Staging、Free/no-billing 确认。
- Build metadata 自动生成 package version + checked-out Git SHA。
- Governance 61/61；plain Node tests 53/53；API 16/16；direct typecheck/build、Web build、EdgeOne wrappers passed。
- Implementation commit：`8f462f2df58743210dea7f0a4ba4dd9c0657741d`。
- Receipt：`plan/receipts/step-14-free-deployment-governance.json`。
- 未创建/修改云资源。

## Step 15 — pending

- 版本从 V5.2.10 按规则推进到下一版本并更新 release notes。
- `pnpm version:stamp` 更新版本指纹。
- Node 22 / pnpm 9.15.9：offline frozen install、workflow、all tests、typecheck、build、wrapper import。
- Gitleaks 8.30.1 完整历史扫描；不得把 Secret 写入仓库/日志。
- 普通 push `develop`；禁止 force push。

## Step 16 — blocked until explicit confirmation

- 只有 Step 15 通过后才允许创建云项目。
- 创建 Supabase Project 前必须再次告知用户：当前成本 `0 元/月`，并获得确认。
- 必须确认 region；默认建议 Singapore。
- 顺序：Supabase Free Staging → GitHub migration Secret → database-only bootstrap → `edgeone-staging` → EdgeOne Makers Free project/runtime vars → full Staging deploy verify。

## Current free-tier boundary

- Supabase org `sctiyeyjvaezeofhysfq`；projects 0；project cost monthly 0。
- Supabase budget：500 MB DB、1 GB Storage、当前 10 GB aggregate bandwidth（5 GB cached + 5 GB uncached）。
- Free inactive project may pause；Production 前必须实现加密外部导出并完成恢复演练。
- EdgeOne Free：40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。
- 70% quota 开始清理/归档；85% 冻结非必要附件上传；不自动升级。

## Safety

- 当前无 Supabase/EdgeOne/Railway/Cloudflare Pages/R2 真实资源。
- 未配置真实 Secret、未部署 Staging、未创建 Production 资源。
- 不在聊天、仓库、日志或 artifact 中保存凭据。
- 无 force push、无历史改写。
- 境外平台不可达时停止并提醒开启 VPN。
