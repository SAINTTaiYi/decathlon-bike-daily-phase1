# Phase A Full-stack Rewrite Plan

在不重做现有 lookbook UI 的前提下，将 v5 本机业务工作流迁移为 PostgreSQL 事实源。先建立工作区和共享业务层，再建设安全 API，随后把前端接到 API，最后补齐四平台部署自动化。每一步单独验证并写 receipt；最终步骤必须执行测试、构建、Secret 扫描和私有仓库推送。

高风险 shell/front-end 步骤已由用户明确确认“现在开始”。Production 云资源仍需在 Staging 验收后单独批准。

# Phase B Staging Plan

1. 从已验收的 `main` 创建 `develop`，建立仅允许 `develop` 部署的 `staging` GitHub Environment。
2. 修复首次 develop 触发暴露的 Staging Workflow 引号缺陷，并增加未 Bootstrap 时的 committed-state readiness gate。
3. 对 V5.2.9 执行全量测试、构建、工作流策略与 Secret 扫描，推送 `develop` 并核验 CI/安全跳过。
4. 用户通过 GitHub Environment 或其它安全通道配置 Staging 专属 Secret；普通聊天、仓库、日志和 state 禁止承载 Secret。
5. 仅从 `develop` 手动 Bootstrap Staging，审查并合并非敏感 state PR，再执行真实验收。
6. Staging accepted SHA 固定且全部验收通过前，Production 始终禁止；之后仍需用户单独批准。
