export const APP_VERSION = "5.5.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "修复更新提示触发",
  summary: "未确认当前版本时也会弹出全屏刷新提示，避免首次进入静默跳过。",
  changes: [
    "去掉首次静默写入逻辑：只要本地未确认当前 APP_VERSION 就弹窗。",
    "立即刷新与稍后手动刷新都会把当前版本记为已确认。",
    "补充测试锁定该触发规则。"
  ]
}
