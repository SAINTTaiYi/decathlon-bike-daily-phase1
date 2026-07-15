# 执行检查点

保存时间：2026-07-15 11:42 +08:00
当前阶段：Phase C / Step 10b、Step 12、Step 13 completed；Step 14 免费部署治理 pending

## Accepted remote baseline

- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 当前 `develop` baseline SHA：`64106b6b1f3dab9ea719bb90f31d99b6be68384c`。
- `staging` GitHub Environment ID `18164650072`，custom deployment branch policy 仅允许 `develop`。
- Phase B Step 09 与 Step 10a 已完成，但原 Railway/Cloudflare/R2 Staging Bootstrap 未执行、未创建资源。

## Step 10b — Free/no-card architecture pivot

用户已明确：

- 不再使用腾讯云 CVM/轻量服务器；固定费用高且固定带宽小。
- 整套 Staging/Production 改用免费额度，并且开户/运行不依赖外币信用卡。
- 不允许自动升级、按量付费或超额扣费。
- 保留现有多用户、PostgreSQL 事务、审计、并发控制、私有附件和移动端 UI。

选定新架构：

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite/React static site
       └─ Node.js Cloud Functions · same-origin /api
            ├─ Supabase Free PostgreSQL
            └─ Supabase Free private Storage

GitHub Free
  ├─ private source repository
  ├─ CI / tests / build / Gitleaks
  └─ EdgeOne Git Integration deployment
```

决策事实源：`plan/decisions/free-no-card-stack.md`。
Receipt：`plan/receipts/step-10b-free-no-card-pivot.json`。

## Verified free-tier facts

- EdgeOne Makers 官方当前声明 Free Plan 为 `$0/month` 且长期提供。
- 当前免费配额包括：40 projects、500 builds/month、Cloud Functions 1,000,000 invocations/month、Edge Functions 3,000,000 invocations/month、5 GB site storage。
- EdgeOne Node.js Cloud Functions 支持 npm 生态和框架模式，可承载 Serverless API adapter。
- Supabase MCP 已认证 Organization `SAINTTaiYi's Org` / slug `sctiyeyjvaezeofhysfq`。
- Supabase 当前 projects：0。
- Supabase MCP `get_cost(project)` 返回 recurring monthly amount `0`。
- Supabase Free 当前提供两个 active projects；足够隔离 Staging 和 Production。
- 本次未创建、修改、删除任何云资源。

## Superseded old bootstrap

以下旧依赖和配置清单立即作废，不得继续执行：

- Railway API runtime、Project/Environment/Service、`RAILWAY_API_TOKEN`、`RAILWAY_WORKSPACE_ID`、`RAILWAY_TOKEN`。
- Cloudflare Pages Direct Upload、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。
- Cloudflare R2、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。
- 原首次 Bootstrap 14 Secret + Bootstrap 后第 15 Secret 流程。
- 原 `docs/STAGING-ACCOUNT-SETUP.md` 在 Step 14 重写前只作为历史文档，禁止照其配置。

## Step 12 — EdgeOne Serverless runtime completed

- 新增标准 Fetch Request/Response → Fastify `inject()` adapter；Cloud Function 不启动监听端口。
- 新增 `cloud-functions/api/[[default]].js` 与 `cloud-functions/health/[[default]].js`，分别承载同源 `/api/*` 与 `/health/*`。
- EdgeOne context 的 `env` 和 `clientIp` 进入 API runtime 与请求边界。
- PostgreSQL pool/idle/connect timeout 可配置；Serverless 默认 `DATABASE_POOL_MAX=1`，继续 `prepare=false`。
- 新增 `edgeone.json`：pnpm 9.15.9、Node 22.11.0、API + Web build、`apps/web/dist` 输出。
- Root Node engine 放宽为 20–24，以覆盖 EdgeOne Cloud Functions Node 20/22 runtime；本地与 CI 继续 Node 22。
- Local verification：Node 22.22.2 / pnpm 9.15.9；API tests 14/14、Database 1/1；API/Database typecheck、API/Web build、EdgeOne wrapper import 全通过。
- Receipt：`plan/receipts/step-12-edgeone-serverless-runtime.json`。
- 未创建或修改云资源。

## Step 13 — Supabase private Storage completed

- 删除 R2 runtime adapter 与 R2 signing tests。
- 使用 `SUPABASE_URL` + server-only `SUPABASE_SECRET_KEY` + private bucket；Secret 不下发浏览器。
- 上传使用对象级 signed upload URL（最长 2 小时），查看使用 5 分钟 signed download URL。
- 保留 JPEG/PNG/WebP、单文件 10 MB、每记录最多 6 张、审计、Idempotency 和数据库软删除。
- Complete 阶段同时验证 Storage info，并重新下载对象计算真实 SHA-256，拒绝被篡改内容。
- 新增 `202607150002_supabase_private_storage.sql`：guarded private `bike-ops-media` bucket、10 MB 和 MIME 限制。
- UI 文案已从 R2 改为 Supabase private Storage。
- Local：offline frozen install passed；API tests 16/16、Database 2/2；typecheck/build/wrapper import passed；R2 runtime refs 0。
- Receipt：`plan/receipts/step-13-supabase-private-storage.json`。
- 未创建或修改云资源。

## New implementation queue

### Step 14 — Free deployment governance

- 删除旧 Railway/Cloudflare/R2 ops 与 release workflow 依赖。
- 建立 EdgeOne Git Integration + Supabase migration/storage 的免费部署文档、环境变量和治理测试。
- 明确禁止开启付费套餐、按量付费或自动升级。

### Step 15 — Build/test/push

- tests、typecheck、build、workflow governance、Gitleaks 全量通过。
- 版本化并普通 push `develop`，禁止 force push。

### Step 16 — Free Staging bootstrap

- 只有 Step 12–15 完成后才允许创建云项目。
- 创建 Supabase Project 前必须再次向用户重复成本：`0 元/月`，并获得确认。
- 需要用户选择/确认 Supabase region；默认建议 Singapore。
- 创建 Supabase Free Staging Project、migration、private bucket，再连接 EdgeOne Makers Free Project。

### Step 17 — Staging acceptance

- 完整验证账号、角色、业务、并发、审计/撤回、图片、旧数据迁移、离线、设备和无障碍。

## Free-tier operational boundary

- Supabase Free 低活动项目可能在约 7 天后自动暂停，可从 Dashboard 恢复；不承诺 24×7 SLA。
- Supabase Free 没有托管日备份/PITR；Production 前必须实现加密导出并完成恢复演练。
- Supabase Free 预算：500 MB database、1 GB Storage、5 GB egress；接近阈值必须清理/归档，不自动升级。
- EdgeOne 免费条款和配额可能调整；不得开启付费或按量计费能力。
- Staging 与 Production 必须使用独立 Supabase Project、EdgeOne Project 和 Secret；不得复制 Production 数据到 Staging。

## Safety

- 当前无真实 Supabase Project、EdgeOne Project、Railway、Cloudflare Pages 或 R2 资源。
- 未配置真实 Secret。
- 未部署 Staging。
- Production Environment 未创建且 Production 继续禁止。
- 不在聊天、仓库、日志或 state 中保存凭据。
- 无 force push、无历史改写。
