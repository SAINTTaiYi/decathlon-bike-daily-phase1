export const APP_VERSION = "5.6.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "维修完毕改为白色像素消散",
  summary: "维修车辆仅在服务端确认完成后，以白色像素方格向左消散离场。",
  changes: [
    "维修完毕先完成远端确认，成功后才显示整张维修卡的白色像素分解与左向消散，失败不会触发视觉完成态。",
    "像素消散结束后再提交既有维修完成或转入待取结果，保持原有审计、错误反馈和原生滚动。",
    "确认取车继续保留黑色像素填充完成效果；reduced-motion 直接进入最终业务状态。"
  ]
}
