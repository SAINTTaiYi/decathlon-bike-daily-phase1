export const APP_VERSION = "5.5.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "前台切回时检查版本更新",
  summary: "已打开的工作台在切回前台时会请求服务端版本；若已发布新版本则弹出刷新提示，避免继续使用旧缓存页面。",
  changes: [
    "UpdateRefreshDialog 在 window focus / 页签可见时请求 /api/v1/meta/version。",
    "本地打包版本与服务端 appVersion 不一致时弹出更新提示。",
    "同一服务端版本点“稍后”后不会在每次聚焦时重复打扰。"
  ]
}
