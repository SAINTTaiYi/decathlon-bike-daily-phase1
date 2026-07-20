export const APP_VERSION = "5.6.9"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "维修消散改为街机像素离场",
  summary: "维修卡仅在服务端确认后切换为黑色像素场，白色方格随机向左跳离并逐颗熄灭。",
  changes: [
    "白色大像素方格采用硬边、跳帧式单颗离场，随机但右侧优先，不再使用柔和淡出或连续漂移。",
    "维修完毕仍先等待服务端确认，失败不触发离场；最后一颗像素熄灭后才提交原有完成或转入待取结果。",
    "确认取车继续保留黑色像素填充完成效果；reduced-motion 直接进入最终业务状态。"
  ]
}
