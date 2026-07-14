# Phase A Full-stack Rewrite Plan

在不重做现有 lookbook UI 的前提下，将 v5 本机业务工作流迁移为 PostgreSQL 事实源。先建立工作区和共享业务层，再建设安全 API，随后把前端接到 API，最后补齐四平台部署自动化。每一步单独验证并写 receipt；最终步骤必须执行测试、构建、Secret 扫描和私有仓库推送。

高风险 shell/front-end 步骤已由用户明确确认“现在开始”。Production 云资源仍需在 Staging 验收后单独批准。
