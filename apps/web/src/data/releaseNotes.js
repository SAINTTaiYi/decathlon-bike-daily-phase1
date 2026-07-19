export const APP_VERSION = "5.5.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "卡片状态徽章靠右",
  summary: "把来源/支付/状态徽章上移到卡片顶部右侧，减少右侧空白，维修内容仍全宽。",
  changes: [
    "顶部右侧集中放置 ACTIVE 与来源/支付/状态徽章。",
    "维修内容、电话、日期继续全宽横排，不被右侧栏挤压。",
    "超窄屏下徽章回落到标题下方，避免车型被挤扁。"
  ]
}
