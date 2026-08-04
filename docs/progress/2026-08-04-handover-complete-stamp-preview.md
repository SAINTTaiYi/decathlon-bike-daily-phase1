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

## Preview delivery evidence

- Candidate PR `#135` passed GitHub `verify` and `secrets`, then was normally merged to `feature/cloudflare-workers-d1` as `7eeef6e457232466b0a02b48d3d55dc95bb4d3a6`.
- The canonical manual workflow `deploy-cloudflare-preview.yml` was dispatched only after explicit `confirm_free_plan=true`, `confirm_no_billing=true`, and `confirm_preview_only=true` confirmations. Run `30919256531` completed successfully.
- The workflow applied only **Preview D1** migrations and deployed only the `bike-ops-preview` Worker/static assets. Production and Production D1 were not selected or touched.
- Independent no-cache probes converged to `5.8.1` / `7eeef6e` for `/health/live`, `/health/ready`, and `/api/v1/meta/version`; the metadata reports `environment: "preview"` and `platform: "cloudflare-workers-d1"`.
- Preview Web-shell verification confirmed HSTS, strict CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, and disabled camera/microphone/geolocation permissions. HTTP redirects to HTTPS.
- Deployed CSS asset contains `handover-complete-stamp`, the arrival and trail keyframes, and the `#ffc31a` yellow token. The minified JS deliberately does not preserve development function names; the workflow's source-build and release-identity verification is the authoritative execution proof.

## Human acceptance queue

Use the Preview URL in an authenticated real session. On **其它 / Other**: expand an unresolved handover, choose **完成交接**, then confirm that the persisted card collapses, the right-side capsule is absent, the lower-right stamp enters once with a short yellow trajectory, and a subsequent tap reopens the details and audit history. Do not deploy Production until this Preview behavior is explicitly accepted.
