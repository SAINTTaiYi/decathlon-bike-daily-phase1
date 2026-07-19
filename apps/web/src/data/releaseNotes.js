export const APP_VERSION = "5.5.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "版本更新强制刷新提示",
  summary: "版本变化时全屏提示用户刷新，避免继续使用缓存旧页面。",
  changes: [
    "进入网站检测到 APP_VERSION 变化时弹出全屏更新提示。",
    "提供立即刷新与稍后手动刷新；本地记住已确认版本，同版本不再重复弹出。",
    "覆盖登录、同步与主工作台路径，保证更新后第一时间可见。"
  ]
}
