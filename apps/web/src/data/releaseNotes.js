export const APP_VERSION = "5.5.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "操作即时反馈与退场动效",
  summary: "补丁位进十进位为次版本：通知/维修乐观更新；全站按钮点按反馈；维修完毕左滑退场且不跳转待取。",
  changes: [
    "版本号规则：补丁到 10 自动进次版本（5.4.10 → 5.5.0）。",
    "通知状态与维修完毕先本地更新，后台同步服务器。",
    "全部按钮 anime.js 点按缩放；维修完毕 GSAP 左滑退场，停留维修模块。"
  ]
}
