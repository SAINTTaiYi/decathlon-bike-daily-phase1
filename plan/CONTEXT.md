# 压缩上下文事实源

更新时间：2026-07-15 12:50 +08:00

## Repository baseline

- 项目：`/workspace/decathlon-bike-daily-phase1`；私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted main：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 远端 develop：`a492fdb1e42b0dacce49ee27b4e426a3d584fa06`。
- Step 12 commit：`a77083447d6724bf1bf1e1e1722014fc70801ab6`。
- Step 13 commit：`bc062820e85430149d6cf5d6c593fbfd24302818`。
- Step 14 implementation commit：`8f462f2df58743210dea7f0a4ba4dd9c0657741d`。
- 当前 develop 相对 origin/develop ahead 3；尚未执行 Step 15 普通 push。
- `staging` GitHub Environment ID `18164650072`，仅允许 `develop`。

## Accepted free/no-card architecture

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite/React static Web
       └─ same-origin Node.js Cloud Functions
            ├─ Supabase Free PostgreSQL
            └─ Supabase Free private Storage

GitHub Free
  ├─ private source + CI/Gitleaks
  └─ migration-gated promotion to EdgeOne Git deployment branches
```

用户约束：无需外币信用卡、零固定费用、不允许付费套餐/按量计费/自动升级；保留多用户、事务、审计、revision、RBAC、私有附件和移动端 UI。

## Step 12 completed — EdgeOne runtime

- Fetch Request/Response → Fastify inject adapter；Cloud Function 不监听端口。
- `cloud-functions/api/[[default]].js`、`cloud-functions/health/[[default]].js`。
- EdgeOne context env/clientIp 映射。
- Supavisor transaction pooler，默认 pool max 1、idle 5 秒、connect 15 秒、prepare false。
- `edgeone.json` 固定 Node 22.11.0 / pnpm 9.15.9 / `pnpm build:edgeone` / `apps/web/dist`。

## Step 13 completed — Supabase private Storage

- 删除 R2 runtime；使用 `SUPABASE_URL`、server-only `SUPABASE_SECRET_KEY`、private `bike-ops-media`。
- 对象级 signed upload；5 分钟 signed download。
- Complete 验证 size/MIME/声明 SHA，并重新下载对象计算真实 SHA-256。
- 10 MB、JPEG/PNG/WebP、每记录 6 张、审计、Idempotency 和软删除保持不变。
- Migration `202607150002_supabase_private_storage.sql` guarded reconcile private bucket。

## Step 14 completed — Free deployment governance

- 删除 Railway、Cloudflare Pages/R2、容器、infra state PR、旧 bootstrap 和旧 ops CLI。
- EdgeOne 不直接监听 `develop`/`main`；专用分支：`edgeone-staging`、`edgeone-production`。
- 手动 GitHub workflow 顺序固定：immutable SHA/approval → tests/typecheck/build → checksum migration → ordinary fast-forward push → EdgeOne Git deploy → Web/API/database/version/SHA/environment verify。
- `scripts/ops/promote-branch.mjs` 只允许两个部署分支，读取远端、拒绝 non-fast-forward、禁止 force push。
- EdgeOne build 不执行 migration；GitHub Environment 只保存 migration-only URL 和非敏感 site URL。
- Staging 支持 `database_only_bootstrap=true`，先建 schema/private bucket，再导入 EdgeOne project，避免首个函数对空库运行。
- Production 要求 accepted Staging SHA、相同源码、审批、加密外部导出、恢复演练、Free/no-billing 确认。
- Build metadata 从 package.json + checked-out Git commit 生成；部署验收核对 exact SHA/version/environment。
- Workflow governance 61/61；plain Node tests 53/53；API 16/16；直接 typecheck/build、Web build、wrapper import passed。
- Receipt：`plan/receipts/step-14-free-deployment-governance.json`。

## Current free-tier facts

- EdgeOne Makers Free：40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。
- Supabase org：`SAINTTaiYi's Org` / `sctiyeyjvaezeofhysfq`；projects 0；MCP project cost monthly amount 0。
- Supabase operational budget：500 MB DB、1 GB Storage、当前 10 GB aggregate bandwidth（5 GB cached + 5 GB uncached）。
- Free inactive project may pause；Free 不满足 Production 托管日备份/PITR 要求。
- 70% quota 开始清理/归档规划；85% 冻结非必要附件上传；不得自动升级。

## Recovery queue

1. Step 15：版本化到下一 V5 版本，更新 release notes，Node 22/pnpm 9 全量 tests/typecheck/build/workflow/Gitleaks，普通 push develop，禁止 force push。
2. Step 16：再次向用户重复 Supabase Project 成本 0 元/月并确认 region（默认建议 Singapore）后，才创建 Supabase Free Staging Project；先 database-only bootstrap，再创建 `edgeone-staging` 和 EdgeOne Free project。
3. Step 17：完整 Staging 验收；Production 继续禁止。

## Safety

- 当前 Supabase projects 0；EdgeOne project 0；无 Railway/Cloudflare Pages/R2 资源。
- 未配置真实 Secret，未部署 Staging，未创建 Production Environment/资源。
- 无 force push、无历史改写。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
