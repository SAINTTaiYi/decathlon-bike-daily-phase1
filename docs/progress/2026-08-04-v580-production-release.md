# Workshop V5.8.0 正式发布证据

- **发布日期**：2026-08-04（+08:00）
- **发布范围**：已人工验收的桌面工作台密度与卡片固有高度、桌面展开卡固定列宽、待取卡标题与确认取车动作恢复、其它交接卡“完成交接”动作恢复。
- **正式版本**：`5.8.0`（由 `5.7.10` 按已确认的补丁位进位规则单次公开变更）。
- **发布 PR**：[PR #132](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/132) `release: V5.8.0 · desktop workbench and handover completion`。
- **候选提交**：`110aa9ef680f893d46bfe9074f2f820502b77663`。
- **合并/实际发布提交**：`ba86fd33f8f7c5dbc90ce37998a7876d0a0e85b7`，位于 `feature/cloudflare-workers-d1`。
- **发布工作流**：`Deploy Cloudflare staging · free stack`，run [`30911801908`](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/30911801908)，`success`。
- **实际目标**：Cloudflare Worker `bike-ops-staging` / `https://workshop.skin`；历史 `staging` 技术标签沿用，但该域名是当前正式线上入口。

## 发布前门禁

候选在正式发布前已通过：

- `pnpm check:version -- --mode production`；
- 7 个 domain、10 个 database、147 个 web、21 个 API、28 个 Worker 测试；
- typecheck、88 条 workflow policy、production build、`git diff --check`；
- 本地 CodeGraph 后置同步与状态：196 files / 2,325 nodes / 7,735 edges，up to date。

第一次完整门禁在新 worktree 因缺少 `react` 依赖失败；未修改源码。随后使用 `CI=true pnpm install --offline --frozen-lockfile` 后重跑，任务 `workshop-v580-production-gates-v2` exit 0。CSS/Markdown 为 CodeGraph 明确未索引类型，由契约测试、构建与 Git diff 校验补偿。

## 独立线上核验

工作流成功后，未重放部署，而是从线上独立读取：

| 端点 | 结果 |
| --- | --- |
| `/health/live` | `200`，`status: ok`，`version: 5.8.0`，`gitSha: ba86fd33…` |
| `/health/ready` | `200`，`status: ready`，`version: 5.8.0`，`gitSha: ba86fd33…` |
| `/api/v1/meta/version` | `200`，`appVersion: 5.8.0`，`gitSha: ba86fd33…`，`platform: cloudflare-workers-d1` |

HTTPS 端点同时确认了 HSTS、严格 CSP（含 `frame-ancestors 'none'`）、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、Referrer Policy 与 Permissions Policy。正式环境与正式 D1 均以现有 canonical Cloudflare 流程发布；未调用已弃用的 EdgeOne 工作流。

## 后续

本发布已完成。后续改动必须从 `feature/cloudflare-workers-d1` 开始新的 Preview 周期；不得因本文件而再次触发部署或另行变更公开版本号。
