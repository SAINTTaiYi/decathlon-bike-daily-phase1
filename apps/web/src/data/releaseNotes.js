export const APP_VERSION = "6.8.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.15",
  title: "Shiphub 同步停摆修复 · 定时任务拆分",
  summary: "修复晚间偶发的待取车数据停摆：把 BI 数据预热从每分钟同步中拆出，避免两者挤在同一轮定时任务里被平台 CPU 限额打断",
  changes: [
    "修复晚间偶发的 Shiphub 同步停摆（最长 45 分钟无数据更新）",
    "BI 数据预热改为独立定时任务，不再与 Shiphub 同步同轮执行",
    "被中断的同步最快 1 分钟内自动接管重试（此前最多要等 2 分钟）",
    "待取车看板、闭店日报图与 BI 面板功能均无变化，仅提升数据刷新稳定性"
  ]
}
