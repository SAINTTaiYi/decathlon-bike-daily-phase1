export const APP_VERSION = "5.7.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.22",
  title: "修复自提日报联系方式位置",
  summary: "修复自提订单手机号或会员号在导出日报图时被误放入详情的问题。",
  changes: [
    "自提订单联系方式使用日报图专属联系槽位，手机号和会员号不再作为详情渲染。",
    "日报图详情测量与实际绘制共用自提字段过滤规则，自提标识继续显示在取车时间位置。"
  ]
}
