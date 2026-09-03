export const APP_VERSION = "6.5.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.03",
  title: "BI 车型名同步改为登录触发",
  summary: "车型名同步从定时轮询改为当天首个成功登录自动触发一次；Staging 配置 CubeInStore 官方凭据后，车型榜显示官方名称与产品类型。",
  changes: [
    "BI 车型名同步不再挂在每 5 分钟定时任务上，改为当天（北京时间）首个成功登录自动触发一次",
    "同步守卫按自然日判定：跨天即重新同步，同日后续登录不再重复请求上游",
    "Staging 部署自动注入 CubeInStore 官方凭据，车型商品码显示官方品名与产品类型",
    "手动同步入口保留，管理员仍可强制刷新并补充新码"
  ]
}
