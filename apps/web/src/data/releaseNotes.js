export const APP_VERSION = "5.6.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "维修卡改为右向左透明像素消散",
  summary: "维修完成确认后，较小黑色像素从右向左逐颗透明，整张卡片平稳消失。",
  changes: [
    "黑色小像素完整覆盖维修卡，从右向左缓慢逐颗变透明，不再保留黑色像素底或白色跳块。",
    "卡片背景与边框同步透明，使底层页面随像素孔洞显现，最后一颗消失后才提交原有完成或转入待取结果。",
    "服务端确认、失败保护、原生滚动和 reduced-motion 路径保持不变。"
  ]
}
