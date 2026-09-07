export const APP_VERSION = "6.7.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "Shiphub 定位脚本提示可收起",
  summary: "定位脚本检测卡片支持一键收起为单行提示，不再占用页面空间；收起状态在本次会话内保持。",
  changes: [
    "Shiphub 定位脚本提示卡右上新增关闭按钮，收起后缩成单行提示，点击可随时展开",
    "收起状态本次会话内记住，切换分类或刷新页面不再重复弹出",
    "修复收起后单行提示可能不显示的问题"
  ]
}
