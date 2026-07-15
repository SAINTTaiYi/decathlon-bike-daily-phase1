# 压缩上下文事实源

更新时间：2026-07-15 10:21 +08:00

## Remote baseline

- 项目：`/workspace/decathlon-bike-daily-phase1`；私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`。
- Accepted main：`e2a64ad4bbec313a23bcec254e12300377763bc8`。
- 当前 develop feature SHA：`9623c6e9090b74de984cfea744da8e584cc23d9c`。
- `staging` Environment ID `18164650072`，仅允许 `develop`。
- Step 09 completed；V5.2.9 最终 CI/staging gate 均成功，未 Bootstrap 时 deploy 安全跳过。

## Step 10a completed — V5.2.10

- 修复 GitHub Actions IPv4-only 与 Supabase default direct IPv6 的 migration 兼容性。
- Migration 改用 `MIGRATION_DATABASE_URL` + Supavisor session pooler 5432；runtime 继续用 transaction pooler 6543。
- Migration URL 不注入 Railway API runtime。
- Supabase Secret 正名为 `SUPABASE_ORG_SLUG`。
- 新增 `docs/STAGING-ACCOUNT-SETUP.md`。
- Version 5.2.10；fingerprint `9e837b2f485bab5cfb03344cda322cee04486ad375820394565b52b3c200fb10`；269 governed files。
- Local：frozen install、68/68 tests、typecheck/build、50/50 policies、无凭据 preflight fail-closed、Gitleaks history/worktree 0 findings。
- GitHub CI `29381722889` success：PostgreSQL 16 migration 首次 applied、第二次 skipped、history count 1；tests/build/Gitleaks success。
- Staging gate `29381722863` success：readiness success，deploy skipped。

## MCP preflight and external blocker — Step 10

- Supabase MCP 已认证：Organization `SAINTTaiYi's Org` / slug `sctiyeyjvaezeofhysfq`，projects 0。
- Cloudflare MCP 已认证：Pages projects 0；R2 返回 `10042`，需用户先在 Dashboard 启用 R2。
- Railway MCP 尚未接入。
- GitHub staging Environment Secret/Variable 为空；MCP 认证不会自动提供 GitHub Actions Secret。
- 首次 Bootstrap 前 14 个 Secret：Cloudflare 2、Railway 2、Supabase 3、R2 2、App 5。
- Bootstrap 创建 Railway Project 后增加第 15 个 `RAILWAY_TOKEN` Project Token。
- 本次 MCP 仅只读检查；无真实项目/Bucket/Pages/Railway 资源，未执行 Staging apply/release；Production Environment 未创建且禁止。

## Recovery queue

1. 用户按 `docs/STAGING-ACCOUNT-SETUP.md` 完成账号/MFA/账单/预算/权限与 14 Secret；Secret 不发普通聊天。
2. 用户只回复配置完成与关键密钥已备份。
3. 助手核验 Secret 名称并再次确认付费资源影响。
4. 用户确认后 Bootstrap Staging。
5. 创建 Railway Project Token、合并 state PR、执行 Staging 全验收。

## 抗中断协议

- 每个可验证步骤后更新 CHECKPOINT、CONTEXT、receipt/steps 和长期记忆。
- 境外平台不可达时停止并提醒开启 VPN，不盲目重试。
- Secret 不进入普通聊天、仓库、日志或 state。
