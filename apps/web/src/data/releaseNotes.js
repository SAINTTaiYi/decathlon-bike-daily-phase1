export const APP_VERSION = "5.6.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.20",
  title: "修复滚动组件进入的空间编排",
  summary: "刷新后向下滚动时，组件进入改为 GSAP 批量空间 reveal，保留完整布局并消除裁切、掉帧与半截显示。",
  changes: [
    "移除滚动进入路径中的 clip-path 与逐项 blur，组件始终维持完整布局。",
    "同一台账记录按组以 GSAP transform、opacity、景深与克制 stagger 进入，降低多组件竞争。",
    "保留已验收的登录入场、移动端原生连续滑动、常驻视差和任务态降噪。"
  ]
}
