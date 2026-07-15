# 压缩上下文事实源

更新时间：2026-07-15 09:27 +08:00

## Remote baseline

- 项目：`/workspace/decathlon-bike-daily-phase1`，私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted main：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 当前 develop：`c702ec97c42f47c2b48295944b30786286986b5f`；Step 09 completed。
- `staging` Environment ID `18164650072`，仅允许 `develop`。
- V5.2.9 CI `29380404926` success；staging gate `29380404844` readiness success / deploy skipped。

## Step 10a current work

官方文档核对发现 Supabase 默认 direct host 是 IPv6，而 GitHub Actions 是 IPv4-only；原 migration 连接会让正确配置的 Bootstrap 在创建部分资源后仍可能失败。Create Project API 实际需要 organization slug，原 `SUPABASE_ORG_ID` 命名也会误导。

V5.2.10 本地改动：

- Migration 使用 `MIGRATION_DATABASE_URL` + Supavisor session pooler 5432（IPv4）。
- Railway runtime 只保留 transaction pooler `DATABASE_URL` 6543，不再注入 migration URL。
- Supabase Secret 正名为 `SUPABASE_ORG_SLUG`。
- V5.2.10 fingerprint `9e837b2f485bab5cfb03344cda322cee04486ad375820394565b52b3c200fb10`，269 governed files。
- Frozen install、68/68 tests、typecheck/build、50/50 policies、离线 plan、无凭据 preflight fail-closed 全部通过。
- Gitleaks 历史 7 commits/约 848 KB 与工作树约 2.89 MB 均 0 findings。
- 新增 `docs/STAGING-ACCOUNT-SETUP.md` 与 Step 10a receipt；当前待 push 和 GitHub CI PostgreSQL 16 migration 验证。

## External blocker

- 用户确认 Cloudflare、Railway、Supabase 均未准备。
- GitHub staging Environment Secret/Variable 为空；本地无云登录/环境变量。
- 首次 Bootstrap 前 14 个 Secret：Cloudflare 2、Railway 2、Supabase 3、R2 2、App 5。
- Bootstrap 创建 Railway Project 后增加第 15 个 `RAILWAY_TOKEN` Project Token。
- 无真实云资源，未执行 Staging apply/release；Production Environment 未创建且禁止。

## Recovery queue

1. V5.2.10 stamp + full verification + Gitleaks。
2. Push develop，核验 CI PostgreSQL migration 与 staging safe-skip。
3. 用户按 `docs/STAGING-ACCOUNT-SETUP.md` 完成账号/MFA/账单/14 Secret。
4. 核验 Secret 名称并再次确认付费资源后 Bootstrap。
5. 创建 Railway Project Token、合并 state PR、执行 Staging 验收。

## 抗中断协议

- 每个可验证步骤后更新 CHECKPOINT、CONTEXT、receipt/steps 和长期记忆。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
- Secret 不进入普通聊天、仓库、日志或 state。
