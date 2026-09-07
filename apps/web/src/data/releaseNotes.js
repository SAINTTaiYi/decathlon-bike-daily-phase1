export const APP_VERSION = "6.6.11"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.07",
  title: "修复桌面端总览崩溃",
  summary: "BI 周结趋势卡单周数据守卫",
  changes: [
    "修复桌面端总览白屏：BI 周结趋势卡仅有单个已完结周（W36）时计算环比取不到上一周导致崩溃",
    "单周时趋势卡显示首周文案（次周起展示环比），与副标题口径一致",
    "新增回归测试，注入旧写法实测变红"
  ]
}
