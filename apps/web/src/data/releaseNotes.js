export const APP_VERSION = "5.4.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "台账操作即时反馈",
  summary: "通知状态与维修完毕等操作先用接口返回结果更新界面，后台再同步全量数据，减少等待。",
  changes: [
    "通知状态 / 维修完毕等写操作成功后立即更新本条记录。",
    "全量 bootstrap 改为后台同步，不再挡住成功提示。",
    "启动同步不再等待自动清理历史完成记录。"
  ]
}
