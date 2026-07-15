# 执行检查点

保存时间：2026-07-15 08:22 +08:00
当前阶段：Phase A / `08-build-test-push`（V5.2.8 CI 修复已完成本地验证，待提交推送）

## 完成状态

- `01-foundation`：completed。
- `02-domain-database`：completed。
- `03-api-auth`：completed。
- `04-api-business-media`：completed。
- `05-web-api`：completed，receipt `plan/receipts/step-05-web-api.json`。
- `06-deployment`：completed_local，receipt `plan/receipts/step-06-deployment.json`。
- `07-governance`：completed，receipt `plan/receipts/step-07-governance.json`。
- `08-build-test-push`：in_progress / ready_to_push_ci_fix，receipt `plan/receipts/step-08-build-test-push.json`。

## V5.2.8 release facts

- Version：`5.2.8`。
- Fingerprint：`c323b6258b544cd3a4eb95290680d569401f200c07227d831605d71dfa06d176`。
- Governed files：268。
- Release notes：3 项。
- 变更主题：修复首次 push 时 Gitleaks 根提交范围失效；完整历史 Secret 扫描；GitHub Actions Node 24 与完整 commit SHA 固定。
- Code snapshot：当前 Monorepo、30 个 React 组件、30 条 API 路由；`code/*.json` 为派生索引。

## Strict local verification

- Node：官方 `v22.22.2` ARM64 包，下载后按 Node.js 官方 `SHASUMS256.txt` 校验通过。
- pnpm：`9.15.9`，`pnpm install --frozen-lockfile` passed。
- Tests：68/68 passed（Domain 4、Database 1、Web/Ops 51、API 12）。
- Typecheck：Contracts、Database、API passed。
- Builds：Contracts、Database、API、Web passed；Vite production bundle passed。
- Version guard：V5.2.8、3 项更新、268 governed files passed。
- Workflow：4/4 YAML parsed；39/39 policies passed。
- Gitleaks 8.30.1：完整已提交 Git 历史 3 commits、约 800 KB、0 findings；当前工作树约 2.86 MB、0 findings。
- Gitleaks shell argument audit：`--log-opts=--all --full-history --no-merges` 作为单一参数传入。
- Docker/Railway static check、offline ops、credentialless fail-closed 与 Impeccable 结果沿用已验证事实；未执行云资源或 Production。

## Git and remote

- Remote repository：私有，`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Origin：`https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git`。
- Local branch：`main`，跟踪 `origin/main`。
- 当前远端 `main` SHA：`c31dcf6f5102f246d72d50836f4adbb4690310a1`。
- 当前本地 HEAD：`c31dcf6f5102f246d72d50836f4adbb4690310a1`；V5.2.8 修复尚未提交。
- GitHub CLI 使用官方 OAuth 登录 `SAINTTaiYi`，仓库 `permissions.push=true`，scopes 为 `repo`、`workflow`、`read:org`、`gist`。

## First GitHub CI result

- Workflow：`CI`。
- Run ID：`29377747730`。
- Head SHA：`c31dcf6f5102f246d72d50836f4adbb4690310a1`。
- URL：`https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/29377747730`。
- Overall：failure。
- `verify` job：passed（Node 22、PostgreSQL 16 checksum migration runner 与第二次幂等执行、workflow policy、68 tests、typecheck、build）。
- `secrets` job：failed due to scanner error, not a Secret finding。
- Root cause：`gitleaks-action@v2` 在仓库首次 push 中构造 `root_commit^..HEAD`；根提交没有父节点，Git 返回 unknown revision；扫描量为 0 bytes。

## V5.2.8 remediation

- 不再依赖 action 的首次 push 事件范围推导。
- CI 固定 Gitleaks `8.30.1`，下载后校验官方 linux_x64 SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`。
- 执行 `gitleaks git --log-opts="--all --full-history --no-merges"`，覆盖根提交和完整历史。
- Secret scan checkout 设置 `persist-credentials: false`；SARIF artifact 保留 30 天。
- `checkout`、`setup-node`、`upload-artifact` 使用 Node 24 运行时版本并固定到完整 40 字符 commit SHA。
- 工作流治理新增 5 项策略，总数 39。

## Resume exactly here

1. 运行最终 JSON/YAML/version/diff/Secret 安全检查。
2. 提交 V5.2.8 CI 修复并推送 `main`，禁止 force push。
3. 确认远端 SHA 与新本地 HEAD 一致。
4. 等待新 CI；必须核验 verify 与 secrets 两个 job。
5. 若 CI 通过，将 step 08 标记 completed，提交最终 receipt/checkpoint 并推送。
6. 再核验最终治理 commit 自身 CI；最终结果写入长期记忆，不再制造 receipt-only 无限提交。
7. 未经 Staging 验收和用户另行批准，不得执行任何 Production apply/release。

## Safety

- 无真实云 Secret。
- 无真实云资源。
- 未执行 Staging 或 Production。
- 未删除旧 v5 迁移兼容代码。
- 不在聊天、仓库、日志或 state 中存储凭证。
- 仅 CI workflow 因 main push 自动运行；未触发 bootstrap、staging 或 production workflow。
