# 2026-08-04 · 其它工作交接完成印章 Preview 候选

## 用户验收输入

- 范围仅限“其它工作交接”模块。
- 完成交接后，已展开卡片必须自动收起；再次展开仍能读取详情与操作记录。
- 移除右上角“已完成”胶囊。
- 在收起卡右下显示斜置“已完成”印章，使用网站既有弥散黄，并加入适度轨迹进入动效。

## 实现

- `PickupLedger.jsx` 对交接记录维护持久化完成态快照：仅当**当前展开的**交接记录从未完成变为 `completedToday/completedOn` 后，清空 `expandedId`，实现成功持久化后的自动收起。
- 同时给该新完成记录设置一次性印章进入标记；历史完成记录只显示静态印章，页面重载不重放动效。
- 完成交接时不渲染右上状态胶囊；完成印章保留语义状态标签，卡片摘要仍可点击再次展开。
- `pickup-ledger.css` 使用 `#ffc31a` / 现有 glow token，提供斜置印章、右下到落点的短黄光轨迹、`prefers-reduced-motion` 降级和 forced-colors 回退。

## 验证

- 定向 `handover-completion-action.test.mjs`：3/3 通过。
- 全量 `pnpm test`：149 Web、21 API、28 Worker 通过。
- `pnpm check:workflows`：88 条策略通过。
- TypeScript typecheck 通过。
- CodeGraph：在独立 worktree 初始化后，后置 sync 成功（源码改动 2 个可索引文件 / 43 节点）；CSS 与本 Markdown 是明确非索引例外，分别由 CSS 断言、构建和本文件记录补偿。
- `pnpm build` 首次被版本门禁正确阻止：尚未登记 Preview 源码。下一步登记 Preview 指纹后重跑构建。

## 发布约束

只创建并验证 Cloudflare Preview；等待人工验收，绝不隐式部署 Production。
