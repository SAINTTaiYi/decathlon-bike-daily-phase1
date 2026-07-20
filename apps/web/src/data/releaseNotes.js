export const APP_VERSION = "5.6.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.20",
  title: "加入左滑直删与电子退场反馈",
  summary: "可删除业务台账改为左滑露出删除操作，保留原有撤回语义并以电子扫描式退场反馈确认直接删除。",
  changes: [
    "移除卡片内可见删除按钮，仅在具备删除权限的台账模块标题中持续提示左滑操作。",
    "横向手势仅在确认横移后接管，纵向触摸滚动继续保持原生连续响应。",
    "删除点击不再弹出二次确认；失败时恢复原卡片，成功时以 GSAP 电子闪烁退场。"
  ]
}
