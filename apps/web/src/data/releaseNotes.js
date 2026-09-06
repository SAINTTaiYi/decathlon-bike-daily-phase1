export const APP_VERSION = "6.6.9"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.06",
  title: "BI 周结定时拉取与 KPI 自动填写",
  summary: "周报出的当天自动拉取已完结周数据；安全检查 8538631 当日开单自动填入闭店 KPI",
  changes: [
    "cron 每 5 分钟定时拉取（北京时间 09-23 窗口），周报出当天自动补齐最新完结周",
    "新增 CIS 门店 TO 已完结周趋势卡（桌面趋势图/移动周台账），带拉取时间标注",
    "安全检查 8538631 当日开单量接入闭店 KPI 自动填写（含型号单号）",
    "当日销售概况（TO/件数/单数）随 KPI 弹窗同步展示"
  ]
}
