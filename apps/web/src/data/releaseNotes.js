export const APP_VERSION = "6.7.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "connect 诊断透出",
  summary: "Shiphub connect 非上游错误带出错误名+消息+cause 并写 Workers Logs，修复通用 503 掩盖根因",
  changes: [
    "mapUpstreamError 兜底分支透出非上游错误详情（fetch/D1/crypto），console.error 可查"
  ]
}
