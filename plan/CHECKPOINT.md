# 执行检查点

保存时间：2026-07-15 08:29 +08:00
当前阶段：Phase A / `08-build-test-push` completed；等待用户决定是否进入 Staging 准备

## 完成状态

- `01-foundation`：completed。
- `02-domain-database`：completed。
- `03-api-auth`：completed。
- `04-api-business-media`：completed。
- `05-web-api`：completed，receipt `plan/receipts/step-05-web-api.json`。
- `06-deployment`：completed_local，receipt `plan/receipts/step-06-deployment.json`。
- `07-governance`：completed，receipt `plan/receipts/step-07-governance.json`。
- `08-build-test-push`：completed，receipt `plan/receipts/step-08-build-test-push.json`。

## V5.2.8 release facts

- Version：`5.2.8`。
- Fingerprint：`c323b6258b544cd3a4eb95290680d569401f200c07227d831605d71dfa06d176`。
- Governed files：268。
- Release notes：3 项。
- 变更主题：修复首次 push 时 Gitleaks 根提交范围失效；完整历史 Secret 扫描；GitHub Actions Node 24 与完整 commit SHA 固定。
- Code snapshot：当前 Monorepo、30 个 React 组件、30 条 API 路由；`code/*.json` 为派生索引。

## Strict local verification

- Node：官方 `v22.22.2` ARM64 包，下载后按 Node.js 官方 `SHASUMS256.txt` 校验通过。
- pnpm：`9.15.9`；`pnpm install --frozen-lockfile` passed。
- Tests：68/68 passed（Domain 4、Database 1、Web/Ops 51、API 12）。
- Typecheck：Contracts、Database、API passed。
- Builds：Contracts、Database、API、Web passed；Vite production bundle passed。
- Version guard：V5.2.8、3 项更新、268 governed files passed。
- Workflow：4/4 YAML parsed；39/39 policies passed。
- Gitleaks 8.30.1：完整已提交 Git 历史与当前工作树 0 findings；修复提交后完整 4 commits、约 815 KB、0 findings。
- Gitleaks shell argument audit：`--log-opts=--all --full-history --no-merges` 作为单一参数传入。
- Docker/Railway static check、offline ops、credentialless fail-closed 与 Impeccable 结果沿用已验证事实；未执行云资源或 Production。

## Git and remote

- Remote repository：私有，`SAINTTaiYi/decathlon-bike-daily-phase1`。
- Origin：`https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git`。
- Local branch：`main`，跟踪 `origin/main`。
- 已验证 release/CI fix commit：`569ad0da4d7d8348029e1afbe321424fb5b68d2d`（`fix(ci): scan complete history with verified gitleaks`）。
- GitHub 已确认远端 `main` 为该 SHA，且本地/远端一致。
- GitHub CLI 使用官方 OAuth 登录 `SAINTTaiYi`；仓库 `permissions.push=true`，scopes 为 `repo`、`workflow`、`read:org`、`gist`。
- 无 force push、无历史改写。

## CI history

### Initial run — failure diagnosed

- Run：`29377747730`，head `c31dcf6f5102f246d72d50836f4adbb4690310a1`。
- `verify` job passed。
- `secrets` job 因 `gitleaks-action@v2` 对仓库首次 push 构造不存在的 `root_commit^..HEAD` 而失败；扫描量 0 bytes，不是 Secret finding。

### V5.2.8 remediation run — success

- Workflow：`CI`。
- Run ID：`29379029504`。
- Head SHA：`569ad0da4d7d8348029e1afbe321424fb5b68d2d`。
- URL：`https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/29379029504`。
- Overall：success。
- `verify` job：success，包含 Node 22、PostgreSQL 16 checksum migration runner 与第二次幂等执行、workflow policy、68 tests、typecheck、build、前端遗留检查。
- `secrets` job：success，包含固定 Gitleaks 8.30.1 安装、官方 SHA-256 校验、完整 Git 历史扫描与 SARIF 上传。
- Artifact：`gitleaks-results-29379029504`，artifact ID `8328944245`，未过期。
- Commit check-runs：`verify=success`、`secrets=success`。

## V5.2.8 CI hardening

- CI 固定 Gitleaks `8.30.1`，校验官方 linux_x64 SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`。
- 执行完整 Git 历史扫描，覆盖根提交。
- Secret scan checkout 设置 `persist-credentials: false`；SARIF artifact 保留 30 天。
- `checkout`、`setup-node`、`upload-artifact` 使用 Node 24 运行时版本并固定到完整 40 字符 commit SHA。
- 工作流治理新增 5 项策略，总数 39。

## Next allowed work

1. 本检查点与完成态 receipt 作为最终治理记录提交并普通推送到 `main`。
2. 核验该治理提交自身自动 CI；若通过，只同步长期记忆，不再创建 receipt-only 无限提交。
3. 若用户要继续，先准备 `develop` 与 `staging` GitHub Environment，通过安全通道配置环境专属 Secret。
4. 仅在真实 Staging 完成账号、业务、并发、R2、迁移、离线、设备与备份验收后，才可讨论 Production。
5. 未经用户单独批准，不得执行任何 Production apply/release。

## Safety

- 无真实云 Secret。
- 无真实云资源。
- 未执行 Staging 或 Production。
- 未删除旧 v5 迁移兼容代码。
- 不在聊天、仓库、日志或 state 中存储凭证。
- 仅 CI workflow 因 main push 自动运行；未触发 bootstrap、staging 或 production workflow。
