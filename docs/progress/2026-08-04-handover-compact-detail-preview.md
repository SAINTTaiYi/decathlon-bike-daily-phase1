# 其它交接：紧凑完成态与完整事项展开（Preview）— 2026-08-04

## 用户验收反馈与范围

- `已完成` 交接卡不能再以大印章撑高整张卡；完成态保持为紧凑、正常列表密度的卡片，并保留可辨识的黄色双框完成标记。
- 未完成交接卡展开时，必须在操作按钮上方显示完整 **交接事项** 正文；正文不得使用省略号、line-clamp 或截断。
- 旧记录兼容：若 `detail` 是遗留序号（如 `1`），正文回退到持久化的 `title`；正常记录优先显示完整 `detail`，以避免编辑器为摘要保存的 `title` 被截断。
- 仅 Preview；不改 Worker/API、D1 迁移或数据，不部署 Production。

## 实现与验证计划

- `PickupLedger` 使用 `handoverCardDetail` 区分完整交接正文与卡片摘要。
- 完成印章改为卡片右下角的小型双框标记，完成卡摘要高度回到紧凑规格。
- 添加 UI/CSS 与数据呈现回归契约；执行全量工作流策略、测试、类型检查、构建和 CodeGraph 后置门禁后，再经 PR/CI 发布到 Cloudflare Preview。

## CodeGraph 范围

- 修改前已在独立工作区初始化并验证 CodeGraph：196 files / 2,327 nodes / 7,742 edges。
- CSS 与本 Markdown 不被 CodeGraph 索引；由 CSS 回归契约、构建、`git diff --check` 和后续线上资源核验补偿。
