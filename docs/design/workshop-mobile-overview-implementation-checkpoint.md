# Workshop 移动端总览实现检查点

更新时间：2026-07-28 14:10 +08:00

状态：实现与本地门禁完成，待提交、PR 与 Preview

## 基线与范围

- 设计基线：`docs/design/workshop-mobile-overview-390.md`。
- 视觉参考：用户提供效果图，仅作视觉基准；冲突时以设计文档为准。
- 基线提交：`c4ed931c7a93d3c1904adb94124ee274383eb8a5`。
- 分支：`feat/mobile-overview-ledger`。
- 环境边界：仅 Preview；公开版本保持 V5.7.9；Production 禁止。

## 已完成

- 新增移动端 `WorkshopOverviewPage`，以现有 `auth`、`workflow`、KPI、台账与权限状态为唯一数据源。
- 390×844 首屏几何落地：48/50/152/196/124/105/23px 模块高度，12px 边距与 366px 内容宽。
- 360–430px 响应式、短屏自然滚动、safe-area 与动态可视视口补偿。
- 固定六项底栏，中英双语；桌面原状态列保留，仅移动端隐藏。
- 菜单、日志、KPI 编辑、闭店确认、历史、台账跳转、待取新增与编辑复用既有处理函数。
- 错误/未水合显示 `—`，不把未知状态伪装为真实零值。
- 自托管 Barlow Condensed 500/700；OFL 1.1 与来源记录已入库。
- 原创、无品牌通用自行车工程线稿 SVG 已自托管；SHA-256：`56623a786b7cef0702b2cedd301432f54e018e63637501dfd54e4abb76b7542c`。

## 验证

- `git diff --check`：通过。
- 移动总览专项 + 既有关键测试：15/15。
- 完整 `pnpm test`：Domain 7、Database 10、Web 113、API 21、Worker 28，合计 179/179。
- `pnpm typecheck`：通过。
- `pnpm check:workflows`：5 个工作流 / 88 项策略通过。
- `pnpm --filter @bike-ops/web build`：通过，139 modules。
- `pnpm cf:typecheck`：通过。
- `pnpm build:worker-bundle`：通过。
- 完整 `pnpm build`：功能编译前被既有 Preview 源码登记门禁正确阻止；提交后运行 `pnpm version:preview` 再复跑。
- CodeGraph v1.5.0 修改后同步：185 files / 2,234 nodes / 7,568 edges，up to date。Markdown、CSS、SVG、字体二进制不进入 CodeGraph 语言统计，已显式记录覆盖例外，并由测试、构建、哈希和静态审计覆盖。
- 静态几何审计：基准 Y 坐标、模块高度、366px 内容宽、786px 底栏顶边均匹配设计文档。

## 待办

1. 提交功能实现并取得干净 Git SHA。
2. 临时登记 Preview 源码指纹，完成完整 build，不提升公开版本。
3. 使用独立 browser-harness 对可访问环境做 360/375/390/412/430 视觉与溢出核验。
4. 创建 PR，等待 CI 成功；部署并独立核验 Preview。
5. 将 Preview 交用户人工验收；不部署 Production。


## 人工验收反馈修复 · 2026-07-29

- 反馈：销售主区左侧、四项销售 KPI、Operations Index 与 Pickup 卡片内容偏下并发生拥挤。
- 边界：所有外框高度、模块位置、业务数据与处理函数保持不变。
- 调整：销售主区只上移左侧信息；销售 KPI 移除四个装饰图标并将数字从 25px 调至 29px；Operations Index 保留图标和数字大小；上述单元及 Pickup 卡片全部改用顶部显式定位，数字与箭头错位排列。
- 验证：专项与关键测试 16/16；完整测试、typecheck、88 workflow policies、Web build 及 CodeGraph 均通过。
- CodeGraph：185 files / 2,234 nodes / 7,570 edges，up to date。
- 下一步：follow-up PR、CI、重新部署 Preview，继续等待用户人工验收。
