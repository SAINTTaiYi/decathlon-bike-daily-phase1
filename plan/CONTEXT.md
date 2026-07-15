# 压缩上下文事实源

更新时间：2026-07-15 08:55 +08:00

## 项目目标

数据库驱动的自行车部门闭店与跨日业务工作台。目标平台：Cloudflare Pages + Railway Fastify API + Supabase PostgreSQL + Cloudflare R2；Staging/Production 资源与 Secret 完全隔离。Production 必须在真实 Staging 验收后另行批准。

## Accepted Phase A baseline

- 根目录：`/workspace/decathlon-bike-daily-phase1`。
- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Phase A steps 01–08 completed。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- Phase A V5.2.8：268 governed files；68/68 tests、typecheck/build、39 policies、Gitleaks 0 findings；最终 CI `29379263995` success。

## Phase B Step 09 completed

- 用户已批准继续。
- `develop` 已从 accepted main 创建；V5.2.9 远端 SHA `ebe6fbd7ed97f13f598e752858fada9d5c6f0842`，本地跟踪 `origin/develop`。
- `staging` GitHub Environment ID `18164650072` 已存在，仅允许 `develop` 分支部署。
- 当前套餐不支持 wait timer/审批类 rule，但 custom deployment branch policy 可用且已生效。
- 初始 develop CI `29379639020` success。
- 初始 Deploy staging `29379639033` 在任何云操作前因旧 APP_VERSION Bash 引号缺陷失败；没有凭据访问或云资源变更。

## V5.2.9 facts

- Version `5.2.9`；fingerprint `f133e65e97ea4613451ef5f9fc931f43be8c1c7c81afc75079dddb251d230292`；268 governed files；3 changes。
- 修复 Staging release identity shell quoting。
- 新增 committed-state readiness gate：无 `infra/state/staging.json` 时 deploy job 安全跳过，不读取 Environment Secret、不访问云平台。
- Frozen install、68/68 tests、typecheck、build、43/43 policies、7/7 deployment tests、离线 plan、无凭据 preflight fail-closed 全部通过。
- Gitleaks 8.30.1：完整历史 5 commits/约 823 KB 与提交前工作树约 2.87 MB 均 0 findings。
- V5.2.9 CI `29380266721`：verify/secrets success。
- Staging run `29380266732`：overall success，readiness success，deploy skipped，并输出未 Bootstrap 安全跳过 notice。

## Current blocker — Step 10

- GitHub `staging` Environment 当前没有 Secret/Variable。
- 本地没有 Cloudflare/Railway/Supabase CLI 登录或相关环境变量。
- 无真实 Cloudflare/Railway/Supabase/R2 资源。
- Bootstrap 阻塞于用户通过安全通道配置 15 个 Staging Secret：Cloudflare 2、Railway 3、Supabase 3、R2 2、应用 5；可选 `CUSTOM_WEB_ORIGINS` variable。
- Secret 禁止进入普通聊天、仓库、日志或 state；`CONTACT_ENCRYPTION_KEY` 等关键 Secret 配置前需要安全备份/恢复保管。
- 未执行 Staging apply/release；Production Environment 未创建，Production 禁止。

## Recovery queue

1. 用户在 GitHub `staging` Environment 或安全 Secret 管理通道配置真实 Staging Secret。
2. 仅核验 Secret 名称存在，不读取值；从 `develop` 手动 dispatch Bootstrap Staging。
3. 审查并合并非敏感 state PR。
4. 完成 Staging 全验收并记录 accepted SHA。
5. 仅在用户另行批准后讨论 Production。

## 抗中断协议

- 每完成一个可验证步骤，立即更新 CHECKPOINT、CONTEXT、receipt/steps 和长期记忆。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
- 不把真实 Secret 发送到普通聊天、提交到仓库、写入日志或 state。
