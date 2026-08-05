export const APP_VERSION = "5.8.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.05",
  title: "真实七日业务趋势上线",
  summary: "桌面总览接入门店隔离的真实七日销售与维修进场趋势，清晰区分已保存零值和缺失数据。",
  changes: [
    "销售趋势改用 daily_closings 的近七个自然日真实数据，已保存零值与未保存日期保持不同语义。",
    "维修进场趋势改用永久审计事件统计新增维修单，并排除已撤回事件。",
    "采用 Lieflat Basics F2 发丝折线与 F1 横档柱，补齐键盘重播、缺失提示和 reduced-motion 降级。"
  ]
}
