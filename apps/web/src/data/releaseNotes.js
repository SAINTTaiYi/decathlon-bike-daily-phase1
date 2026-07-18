export const APP_VERSION = "5.4.11"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "操作即时反馈与退场动效",
  summary: "通知/维修完毕先本地乐观更新；全站按钮点按缩放反馈；维修完毕左滑退场且不跳转待取页。",
  changes: [
    "通知状态与维修完毕点击后立即改本地状态，再后台同步服务器。",
    "所有按钮使用 anime.js 点按缩放反馈，并有 CSS active 兜底。",
    "维修完毕用 GSAP 左滑退场，停留在维修模块，不再自动跳到取车。"
  ]
}
