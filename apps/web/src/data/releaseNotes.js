export const APP_VERSION = "5.5.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "修复卡片布局崩溃",
  summary: "覆盖旧三列台账网格，恢复维修内容横排完整显示与确认取车按钮。",
  changes: [
    "卡片改为单列 flex，维修内容完整横排换行，不再竖排。",
    "来源/支付/状态 Badge 固定为小胶囊，不再被拉成超高条。",
    "确认取车按今日是否已取车显示，按钮文案与主操作条可见。"
  ]
}
