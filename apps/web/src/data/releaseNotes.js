export const APP_VERSION = "5.8.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.05",
  title: "桌面工作台完整适配浏览器视口",
  summary: "桌面工作台改为同时依据浏览器可用宽度和高度等比适配，完整显示原生 1536 × 1024 业务画布。",
  changes: [
    "桌面缩放由仅按宽度改为宽高比例取较小值，避免矮窗口截断工作台下方内容。",
    "不同屏幕比例下安全居中并保留留白，维持既有顶栏、侧栏和业务卡片几何。",
    "手机布局、业务规则、API、数据库和 Cloudflare Worker 行为均保持不变。"
  ]
}
