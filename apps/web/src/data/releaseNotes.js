export const APP_VERSION = "5.8.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.23",
  title: "Signal Grid 全系统质量门",
  summary: "固化移动端、强光、无障碍、动效降级与生产构建预算。",
  changes: [
    "修正 Skip Link 主内容目标并统一 100dvh、可见焦点、高对比和打印灰度降级。",
    "新增 320px、VisualViewport、44px 触控、语义控件、色觉与 reduced-motion 回归测试。",
    "每次 production build 自动校验 JS/CSS gzip、Signal 媒体完整性和关键前端质量契约。"
  ]
}
