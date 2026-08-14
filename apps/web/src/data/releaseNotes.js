export const APP_VERSION = "5.9.9"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.15",
  title: "待取台账搜索工具区常驻与卡片动画提速",
  summary: "移除滚动隐藏机制，搜索工具区常驻可见；待取卡展开动画提速并使用统一缓动曲线。",
  changes: [
    "移除搜索栏滚动隐藏机制：删除 data-tools-visible 与 scroll 监听，搜索/筛选/排序/密度/收起工具区在台账滚动时始终可见。",
    "待取卡展开动画提速：卡片摘要过渡 420ms 改为 360ms，展开区 420/180/360ms 改为 360/140/300ms。",
    "动画曲线统一改为 cubic-bezier(.16,1,.3,1)，滚动时工具区不再上下收缩。"
  ]
}
