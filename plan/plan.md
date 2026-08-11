# Phase A Full-stack Rewrite Plan

在不改变现有业务流程与数据契约的前提下，将 v5 本机业务工作流迁移为 PostgreSQL 事实源。界面变更统一遵循 [`DESIGN.md`](../DESIGN.md)。先建立工作区和共享业务层，再建设安全 API，随后把前端接到 API，最后补齐四平台部署自动化。每一步单独验证并写 receipt；最终步骤必须执行测试、构建、Secret 扫描和私有仓库推送。

高风险 shell/front-end 步骤已由用户明确确认“现在开始”。Production 云资源仍需在 Staging 验收后单独批准。

# Phase B Staging Plan

1. 从已验收的 `main` 创建 `develop`，建立仅允许 `develop` 部署的 `staging` GitHub Environment。
2. 修复首次 develop 触发暴露的 Staging Workflow 引号缺陷，并增加未 Bootstrap 时的 committed-state readiness gate。
3. 对 V5.2.9 执行全量测试、构建、工作流策略与 Secret 扫描，推送 `develop` 并核验 CI/安全跳过。
4. 用户通过 GitHub Environment 或其它安全通道配置 Staging 专属 Secret；普通聊天、仓库、日志和 state 禁止承载 Secret。
5. 仅从 `develop` 手动 Bootstrap Staging，审查并合并非敏感 state PR，再执行真实验收。
6. Staging accepted SHA 固定且全部验收通过前，Production 始终禁止；之后仍需用户单独批准。

# Phase C 免费且无需外卡的架构迁移计划

用户于 2026-07-15 明确停止腾讯云服务器方案，并要求整套运行在免费额度内且无需外币信用卡。旧 Cloudflare Pages + Railway + Supabase + R2 Bootstrap 路线立即停止，尚未创建的资源不再创建。

选定运行时为 EdgeOne Makers Free：Vite/React 静态站点与 Node.js Cloud Functions 同项目、同域部署；数据库和私有图片统一使用 Supabase Free；GitHub Free 继续承载私有源码与 CI。详细决策和配额边界见 `plan/decisions/free-no-card-stack.md`。

执行顺序：

1. 增加 EdgeOne Node.js Cloud Functions adapter，尽量复用现有 Fastify API 与业务代码，不重做 UI。
2. 将数据库连接改为 Supavisor transaction pooler + 极小连接池，适配无常驻进程的 Serverless 生命周期。
3. 将 R2 私有附件改为 Supabase private Storage 签名上传/下载，保持校验、审计和软删除。
4. 重写部署治理、环境变量、文档和测试，删除 Railway/Cloudflare/R2 Secret 与发布流程。
5. 全量 tests/typecheck/build/workflow policy/Gitleaks 通过后，版本化并普通推送 `develop`。
6. Supabase MCP 已核验当前 Organization 创建新 Project 成本为 **$0/月**；真正创建前仍必须向用户重复该成本并取得确认。
7. 创建免费 Staging Supabase Project 与 private bucket，连接 EdgeOne Makers Free Git Project，随后执行完整 Staging 验收。
8. 免费方案不宣称 SLA 或托管灾备：Supabase Free 可能因低活动自动暂停，且无托管日备份/PITR；Production 前必须有加密导出和恢复演练。
9. Production 在 Staging accepted 且用户单独批准前继续禁止。
