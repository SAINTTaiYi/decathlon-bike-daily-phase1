export const APP_VERSION = "6.1.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.19",
  title: "Shiphub 自动同步修复与营业时间规则",
  summary: "修复 Shiphub 订单自动同步从未运行的问题；新增硬规则：仅北京时间 10:00–22:00 门店营业时间内允许调用 Shiphub 同步数据；Preview 测试环境改回合成数据并清理真实客户信息。",
  changes: [
    "修复 Shiphub 订单自动同步从未运行的问题：每 5 分钟的定时任务现已随部署启用",
    "新增硬规则：仅北京时间 10:00–22:00 门店营业时间允许同步 Shiphub 数据，其余时间（含手动触发）一律拒绝",
    "同步窗口统一按北京时间判定，不再受门店时区字段影响",
    "Preview 测试环境改用合成数据，不再拉取真实门店订单并已清空既有真实客户信息",
    "清理 Preview 环境遗留的无效密钥"
  ]
}
