export const APP_VERSION = "6.6.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.05",
  title: "页头文字恢复（磨砂 ::before 层级修复）",
  summary: "修复 V6.6.5 页头磨砂 ::before（z-auto 绝对定位）盖住流内文字，品牌字/版本号/模块页头标题/右上用户信息被 backdrop-filter 糊成 smear；压到 z-index -1 后只模糊层背后页面内容。",
  changes: [
    "修复：桌面页头品牌字、版本号、模块页头标题、右上用户信息不再被磨砂背板糊住（::before 压到 z-index -1）",
    "回归断言：页头 ::before 必须含 z-index: -1，注入 z-index:0 实测变红"
  ]
}
