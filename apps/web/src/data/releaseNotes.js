export const APP_VERSION = "5.8.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.23",
  title: "Signal Grid Preview 验收修复",
  summary: "修复销售主 KPI 对比度并恢复关键交互控件的 44px 热区。",
  changes: [
    "销售主 KPI 的标签、数字与待填状态改为明确的白底/深色结构，满足 Preview 实测对比度。",
    "菜单、摘要操作、标题操作、记录历史与紧凑状态选择恢复统一 44px 交互热区。",
    "新增 browser-harness Preview 验收回归测试，防止后续紧凑化覆盖无障碍底线。"
  ]
}
