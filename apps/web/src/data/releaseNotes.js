export const APP_VERSION = "5.6.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "使用中自动检查版本更新",
  summary: "已打开的工作台会定时检查服务端版本，并在滑动、点按、编辑等操作时节流检查；发现新版本即弹刷新提示。",
  changes: [
    "每 30 秒在可见标签页轮询 /api/v1/meta/version。",
    "滑动 / 点按 / 输入 / 滚动时节流检查服务端版本（最少间隔 30 秒）。",
    "保留前台聚焦检查；同一服务端版本点“稍后”后不再反复打扰。"
  ]
}
