export const APP_VERSION = "6.7.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "登录卡变形动效残留 transform 困住下拉菜单层叠修复",
  summary: "修复注册页选择门店下拉被 Profile/显示名/邮箱等字段盖住（桌面+移动端同根因）：GSAP 变形补间收尾清理内联 transform，浮层层叠恢复正常",
  changes: [
    "根因为 useAuthPanelMorph 的 y/autoAlpha 补间残留恒等内联 transform，创建层叠上下文把门店下拉菜单困在所属字段内",
    "body 与字段 stagger 补间统一加 tween 级 clearProps 交还内联样式，动画期间不受影响",
    "新增回归断言 tests/boot-panel-morph-cleanup.test.mjs 4 例（退回旧写法实测变红）；web 497 全绿"
  ]
}
