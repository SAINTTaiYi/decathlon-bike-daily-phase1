# 压缩上下文事实源

更新时间：2026-07-15 08:53 +08:00

## 项目目标

数据库驱动的自行车部门闭店与跨日业务工作台。目标平台：Cloudflare Pages + Railway Fastify API + Supabase PostgreSQL + Cloudflare R2；Staging/Production 资源与 Secret 完全隔离。Production 必须在真实 Staging 验收后另行批准。

## Accepted baseline

- 根目录：`/workspace/decathlon-bike-daily-phase1`。
- 私有仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Phase A steps 01–08 completed。
- Accepted `main` SHA：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- Phase A V5.2.8：268 governed files；68/68 tests、typecheck/build、39 policies、Gitleaks 0 findings；最终 CI `29379263995` success。

## Phase B current state

- 用户已批准继续。
- `develop` 已从 accepted main 创建；本地跟踪 `origin/develop`，初始 SHA 同为 `e2a64ad...`。
- 初始 develop CI `29379639020` verify/secrets success。
- `staging` GitHub Environment ID `18164650072` 已存在，仅允许 `develop` 分支部署。
- 当前套餐不支持 wait timer/审批类 protection rule，但 custom deployment branch policy 可用且已生效。
- 首次 Deploy staging `29379639033` 在任何云操作前因 APP_VERSION Bash 错误引号失败；没有凭据访问或云资源变更。

## V5.2.9 local remediation

- Version `5.2.9`；fingerprint `f133e65e97ea4613451ef5f9fc931f43be8c1c7c81afc75079dddb251d230292`；268 governed files。
- 修复 Staging release identity shell quoting。
- 新增 committed-state readiness gate：无 `infra/state/staging.json` 时 deploy job 安全跳过，不读取 Environment Secret、不访问云平台。
- Workflow policies 43；deployment workflow tests 7/7 passed。
- Frozen install、68/68 tests、typecheck、build、离线 plan、无凭据 preflight fail-closed 全部通过。
- Gitleaks 8.30.1：完整历史 5 commits/约 823 KB 与当前工作树约 2.87 MB 均 0 findings。
- Step 09 receipt 已写入；当前等待提交、push 和远端 CI。

## Blocked boundary

- GitHub `staging` Environment 当前没有 Secret/Variable。
- 无真实 Cloudflare/Railway/Supabase/R2 资源。
- Step 10 Bootstrap 阻塞于用户通过安全通道配置 Staging 专属 Secret。
- Secret 禁止进入普通聊天、仓库、日志或 state。
- 未执行 Staging apply/release；Production Environment 未创建，Production 禁止。

## Recovery queue

1. 全量验证 V5.2.9：frozen install、tests、typecheck、build、workflow/YAML、Secret scan。
2. 提交并普通 push 到 `develop`；核验 CI 与 staging safe-skip。
3. 让用户在 GitHub Environment 或其它安全通道配置真实 Staging Secret。
4. 运行 plan/preflight，手动 dispatch Bootstrap Staging；审查 state PR。
5. 完成 Staging 全验收并记录 accepted SHA。
6. 仅在用户另行批准后讨论 Production。

## 抗中断协议

- 每完成一个可验证步骤，立即更新 CHECKPOINT、CONTEXT、receipt/steps 和长期记忆。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
- 不把真实 Secret 发送到普通聊天、提交到仓库、写入日志或 state。
