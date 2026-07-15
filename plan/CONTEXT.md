# 压缩上下文事实源

更新时间：2026-07-15 08:22 +08:00

## 项目目标

将旧 V5.2.6 本机 Vite + React 闭店日报升级为数据库驱动全栈 Monorepo，同时保留黑白硬边 mobile lookbook UI 与业务规则。目标平台：Cloudflare Pages + Railway Fastify API + Supabase PostgreSQL + Cloudflare R2；Staging/Production 完全隔离。Production 必须在 Staging 验收后另行确认。

## 当前状态

- 项目根目录：`/workspace/decathlon-bike-daily-phase1`
- 事实源：`PRODUCT.md`、`DESIGN.md`、`AUTOMATED-DEPLOYMENT.md`、`plan/CHECKPOINT.md`
- 步骤：01–07 completed；08-build-test-push in_progress / ready_to_push_ci_fix。
- 当前版本：V5.2.8。
- 版本指纹：`c323b6258b544cd3a4eb95290680d569401f200c07227d831605d71dfa06d176`，268 个治理文件，3 项 release changes。
- 前端正式运行使用 `useAuth` + `useRemoteClosingWorkflow`；旧 `useClosingWorkflow.js` 只作 v5 显式迁移与回归参考。
- 无真实云 Secret、无 Cloudflare/Railway/Supabase/R2 资源；未执行 Staging/Production。

## 严格本地验证

- Node.js 官方 v22.22.2 ARM64 包按官方 SHASUMS256 校验通过；pnpm 9.15.9。
- `pnpm install --frozen-lockfile` passed。
- 测试：68/68（Domain 4、Database 1、Web/Ops 51、API 12）。
- TypeScript：Contracts、Database、API typecheck 通过。
- Build：Contracts、Database、API、Web 通过；Vite production build 通过。
- Version：V5.2.8、3 项更新、268 files、fingerprint guard 通过。
- Workflow：4/4 YAML 可解析，39/39 静态安全/顺序策略通过。
- Gitleaks 8.30.1：完整已提交历史 3 commits 0 findings；当前工作树 0 findings。

## Git、认证与远端

- 私有远端：`SAINTTaiYi/decathlon-bike-daily-phase1`。
- `origin`：`https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git`。
- GitHub CLI `gh 2.45.0` 已通过官方 OAuth 登录 `SAINTTaiYi`；scopes `repo/workflow/read:org/gist`，仓库 `permissions.push=true`。
- 已执行 `gh auth setup-git`。
- 当前本地与远端 `main` 仍为 `c31dcf6f5102f246d72d50836f4adbb4690310a1`；V5.2.8 CI 修复尚未提交。

## 首次 GitHub CI

- Run `29377747730`，head `c31dcf6...`，overall failure。
- verify job 全部通过：Node 22、PostgreSQL 16 migration runner、第二次幂等执行、workflow policy、68 tests、typecheck、build。
- secrets job 并非发现 Secret，而是 `gitleaks-action@v2` 在首次 push 构造 `root_commit^..HEAD`；根提交无父节点，unknown revision，实际扫描 0 bytes。

## V5.2.8 修复

- Gitleaks 固定 8.30.1，校验官方 linux_x64 SHA-256 后执行完整 Git 历史扫描，覆盖根提交。
- Secret scan checkout 不持久化凭证，SARIF artifact 保留 30 天。
- checkout/setup-node/upload-artifact 使用 Node 24 运行时版本并固定完整 commit SHA。
- 工作流治理新增完整 Action SHA、Gitleaks 版本、二进制摘要、完整历史与无持久凭证规则；总计 39 项。
- Service Worker cache 与现行文档同步到 V5.2.8。

## 当前任务

1. 对最终 diff、JSON/YAML、version 与 Secret 做安全检查。
2. 提交并推送 V5.2.8 CI 修复，不 force push。
3. 等待新 CI 的 verify 与 secrets job。
4. 成功后将 Step 08 标记 completed，提交最终治理记录并推送。
5. 验证最终治理 commit 自身 CI，结果同步长期记忆。
6. 之后才可准备 Staging；未获用户另行批准前，Production 继续禁止。

## 抗中断协议

- 每完成一个可验证步骤，立即更新 `plan/CHECKPOINT.md`、receipt、steps 状态和长期记忆。
- 若境外平台/工具不可达，停止并提醒开启 VPN，不盲目重试。
- 不在普通聊天、仓库、日志或 state 中传输/保存真实 Secret。
