# 执行检查点

保存时间：2026-07-15 06:37 +08:00
当前阶段：Phase A / `08-build-test-push`（进行中）

抗中断治理已启用：每完成一个可验证步骤，立即更新本文件、对应 receipt/步骤状态和长期记忆。压缩上下文事实源位于 `plan/CONTEXT.md`；如境外平台、地址、工具或包源在当前网络不可达，停止该项并提醒用户开启 VPN 后继续。

## 已完成

- `01-foundation`：pnpm Monorepo 与现有 Web 迁移完成。
- `02-domain-database`：共享 Domain、Contracts、Database 与 Supabase 初始 migration/seed 已建立。
- `03-api-auth`：Fastify 真实账号、Session、CSRF、RBAC 已建立。
- `04-api-business-media`：业务路由、审计/撤回、旧 v5 导入与 R2 私有附件接口已建立。
- 部署方案已保存于 `AUTOMATED-DEPLOYMENT.md`；目标为 Cloudflare Pages + Railway + Supabase PostgreSQL + Cloudflare R2，Staging/Production 隔离。

## `05-web-api` 当前进度

已确认存在并开始审计：

- `apps/web/src/App.jsx` 已改用 `useAuth` 与 `useRemoteClosingWorkflow`。
- 登录已接到数据库账号与密码；会话由 HttpOnly Cookie/CSRF API 管理。
- 正式业务读写已接到 `/api/v1/*`，包括销售、闭店、台账、状态动作、审计撤回。
- 已加入远端 hydration、45 秒轮询、窗口聚焦刷新、离线只读、Session 过期处理和 revision conflict 刷新。
- 已加入一次性管理员 Setup、旧 v5 显式迁移 Dialog、R2 附件 Dialog。
- 旧 `useClosingWorkflow.js` 仍保留用于本机 v5 兼容/测试参考，但 `App.jsx` 不再将其作为正式业务事实源。
- Impeccable 项目上下文和 `product` register 已读取；`PRODUCT.md` / `DESIGN.md` 继续作为事实源。
- `design-taste-frontend` 与 `impeccable` 已校准；当前环境中的 `shadcn-ui`、`ui-ux-pro-max` 只有目录条目，因此使用现有组件语义与默认设计系统指导。
- Impeccable detector 对 `App.jsx`、components、styles 的扫描结果为 `[]`。

## 尚未完成 / 未宣称通过

- Shell 的标准 `PATH` 不含 pnpm shim，但已在本机缓存定位并验证 pnpm 9.15.9：`node /root/.npm/_npx/8959f4e966f464e2/node_modules/pnpm/bin/pnpm.cjs`。版本与根 `package.json` 的 `packageManager` 完全一致，无需联网安装。
- `05a-baseline` 已完成并记录于 `plan/receipts/step-05a-baseline.json`：Domain 4/4、原 Web 规则 30/30、API 8/8，共 42 项测试全部通过；Contracts、Database、API TypeScript 检查通过。
- `05b-contract-audit` 已完成并记录于 `plan/receipts/step-05b-contract-audit.json`。主要字段映射匹配，发现 6 个生产边界。
- `05c-sync-safety` 已完成并记录于 `plan/receipts/step-05c-sync-safety.json`：Abort、Bootstrap 错误/锁写和同步时间已修复；Web 31/31、Vite build、detector 通过。
- `05d-auth-boundary` 已完成并记录于 `plan/receipts/step-05d-auth-boundary.json`：首次强制改密、密码复用拒绝和迁移入口权限已修复；API/Web/typecheck/build/detector 全通过。
- `05e-audit-history` 已完成并记录于 `plan/receipts/step-05e-audit-history.json`：跨日与生命周期历史已修复；API 12/12、Web 33/33、typecheck、Vite build、detector 全通过。
- `05-web-api` 已完成并记录于 `plan/receipts/step-05-web-api.json`。最终验证：Domain 4/4、Web 33/33、API 12/12，共 49 项通过、0 失败；Contracts/Database/API typecheck 通过；Contracts/Database/API/Web build 通过；detector 0；diff check 通过。真实数据库、浏览器 E2E、R2 和手机验收递延至 Staging。
- `06-deployment` 已进入进行中。
- `06a-deployment-audit` 已完成并记录于 `plan/receipts/step-06a-deployment-audit.json`，发现 10 项 CLI/Workflow 风险。
- `06b-cli-hardening` 已完成并记录于 `plan/receipts/step-06b-cli-hardening.json`：严格命令/环境；损坏 state 拒绝与原子/阶段性非敏感检查点；命令 Secret 脱敏；仓库内 checksum/advisory-lock migration runner；Supabase runtime/direct URL 分离；移除无效 R2 token-factory 分支并强制 Bucket S3 凭证；Production release 需批准+备份确认；自定义 Web Origin 进入 API CORS；Railway 资源分阶段保存。
- `06c-workflow-hardening` 已完成并记录于 `plan/receipts/step-06c-workflow-hardening.json`：Bootstrap 只映射所选 GitHub Environment Secret；Staging 固定 develop；Production 仅 main 手动触发，并要求 Staging 验收源码 SHA、不可变 version/SHA、环境审批、显式批准和备份确认；发布顺序固定为 migration → API → API verify → Pages → final verify；中断 state 同时保存 artifact/commit；境外 npm/GitHub/云 API/数据库不可达时停止并提示 VPN。验证：YAML 4/4、策略 24 项、聚焦测试 17/17、离线 plan/preflight/release fail-closed 均通过。
- 版本已升级到 V5.2.7，根 package、Web package 与 releaseNotes 已同步；Monorepo 版本脚本路径/扫描范围/参数分隔符已修复。`07-governance` 的 PRODUCT/DESIGN/README/deploy-summary 事实源改写、版本指纹登记和最终 build 尚未完成。
- `08-build-test-push` 尚未开始；当前仓库 `main` 没有任何 commit，全部文件仍为 untracked，尚未创建远端或推送。
- 尚未创建任何 Cloudflare、Railway、Supabase、R2 或 Production 云资源；未写入任何真实 Secret。

## 恢复时从这里继续

1. 从 `06-deployment` 本地审计开始，读取：
   - `scripts/ops/index.mjs`、`scripts/ops/lib.mjs`
   - `scripts/ops/cloudflare.mjs`、`railway.mjs`、`supabase.mjs`
   - `.github/workflows/*.yml`
   - `infra/docker/api.Dockerfile`、`railway.json`、`.env.example`
2. 运行无凭证 `pnpm ops preflight` / `plan`，要求只报告缺失配置，不访问或修改云资源。
3. 修复幂等、安全、Secret 输出、Staging/Production 隔离和 workflow 顺序问题。
4. 执行本地脚本测试、workflow YAML/脚本语法、Dockerfile/构建配置验证。
5. 写 `plan/receipts/step-06-deployment.json` 后标记 completed；没有用户另行批准时不得执行 Production apply。

## 工作树安全状态

- 未执行 Git commit、reset、clean、checkout 或 push。
- 未删除旧 v5 兼容代码或本机数据迁移逻辑。
- 上一次并行读取在用户要求保存进度时被取消，未产生文件修改。
