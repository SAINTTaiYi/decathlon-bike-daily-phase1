export const APP_VERSION = "6.2.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.22",
  title: "桌面端 UI 回归修复",
  summary: "修复 V6.2.0 移动端导航重构导致的桌面端布局回归：移动端 CSS 规则未用 data-mobile-scene 隔离、泄漏到桌面端（左侧导航被压成底部横幅、模块头网格错乱、英文副标题被隐藏、顶部间距塌陷）。现统一收口，桌面端恢复左侧垂直导航与紧凑模块头；移动端行为保持不变。",
  changes: [
    "桌面端：修复左侧六模块导航被压成底部横幅——移动端 dock 定位规则改为仅 data-mobile-scene 生效",
    "桌面端：修复模块头网格错乱、英文副标题被隐藏、顶部内边距塌陷——shell 与模块头移动规则同样收口到移动端",
    "搜索/工具槽位仅随 mobileLayout 渲染，桌面端不再残留空槽占据模块头网格",
    "移动端行为保持不变（data-mobile-scene 在移动端照常写入）"
  ]
}
