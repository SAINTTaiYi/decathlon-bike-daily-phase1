# 压缩上下文事实源

更新时间：2026-07-15 11:03 +08:00

## Remote baseline

- 项目：`/workspace/decathlon-bike-daily-phase1`；私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted main：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 当前 develop baseline：`64106b6b1f3dab9ea719bb90f31d99b6be68384c`。
- `staging` Environment ID `18164650072`，仅允许 `develop`。
- Phase B Step 09/10a completed；旧 Bootstrap 从未执行，无 Railway/Cloudflare Pages/R2/Supabase Project 资源。

## User pivot — Phase C

用户明确放弃腾讯云服务器，因为固定费用高且固定带宽小；要求整套使用免费额度且无需外币信用卡，不允许自动升级、按量付费或超额扣费。

选定架构：

- Web + API：EdgeOne Makers Free；Vite/React static + Node.js Cloud Functions，同源 `/api`。
- Database + private media：Supabase Free PostgreSQL + private Storage。
- Source/CI：GitHub Free private repo + Actions；部署主要走 EdgeOne Git Integration。
- 保留现有 Fastify 业务代码、PostgreSQL 事务、审计、revision、RBAC、私有附件和 UI；不退回本机 localStorage。

事实源：`plan/decisions/free-no-card-stack.md`。
Receipt：`plan/receipts/step-10b-free-no-card-pivot.json`。

## Verified facts

- EdgeOne Makers 官方当前声明 Free Plan `$0/month` 且长期提供；免费额度包括 40 projects、500 builds/month、Cloud Functions 1M/month、Edge Functions 3M/month、5 GB site storage。
- EdgeOne Node.js Cloud Functions 支持 npm 与框架模式。
- Supabase Organization：`SAINTTaiYi's Org` / `sctiyeyjvaezeofhysfq`；projects 0。
- Supabase MCP project cost：monthly amount 0。
- 本次未创建或修改云资源。

## Superseded

旧 Railway + Cloudflare Pages + R2 自动化与原 14/15 Secret 配置流程作废。`docs/STAGING-ACCOUNT-SETUP.md` 在重写前仅是历史资料，不得继续执行。

## Recovery queue

1. Step 12：增加 EdgeOne Node Cloud Function adapter；数据库连接改为 Supavisor transaction pooler + 极小 pool；Web 同源 API。
2. Step 13：R2 改为 Supabase private Storage signed upload/download，保持媒体校验和审计。
3. Step 14：删除旧 Railway/Cloudflare/R2 ops/workflow；重写免费部署治理、环境变量和文档。
4. Step 15：tests/typecheck/build/workflow policy/Gitleaks，版本化并普通 push develop。
5. Step 16：再次告知用户 Supabase Project 成本 0 元/月并确认 region 后，才创建免费 Staging Project；随后接入 EdgeOne Makers Free。
6. Step 17：完整 Staging 验收；Production 继续禁止。

## Free-tier boundary

- Supabase Free 低活动约 7 天可能自动暂停；可恢复但不具备 SLA。
- Free 无托管日备份/PITR；Production 前必须有加密导出和恢复演练。
- 容量预算：Supabase DB 500 MB、Storage 1 GB、egress 5 GB；不得自动升级。
- EdgeOne 免费配额/条款可能变化，不开启付费或按量能力。

## 抗中断协议

- 每个可验证步骤后更新 CHECKPOINT、CONTEXT、receipt/steps 和长期记忆。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
- Secret 不进入普通聊天、仓库、日志或 state。
