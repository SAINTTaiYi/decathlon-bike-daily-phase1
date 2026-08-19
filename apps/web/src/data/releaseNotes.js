export const APP_VERSION = "6.1.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.19",
  title: "Shiphub 同步修复：连接驱动调度 + 营业时间硬规则",
  summary: "修复 cron 启用后多门店共享 bootstrap token 导致的同步中断；定时同步改为仅同步已授权连接；引擎层增加营业时间硬门禁兜底。",
  changes: [
    "修复 cron 启用后全部门店同步失败（OAUTH_TOKEN_HTTP_400）：定时同步改为连接驱动，仅同步已授权且持有有效 token 的门店",
    "不再对每个门店自动 bootstrap 共享凭据，杜绝并发刷新被上游轮换机制作废",
    "引擎层新增营业时间硬门禁兜底：仅北京时间 10:00–22:00 允许建立上游连接"
  ]
}
