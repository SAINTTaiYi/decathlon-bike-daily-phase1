export const APP_VERSION = "5.4.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "票据卡布局精简",
  summary: "去掉图片按钮；取车时间与手机号同一水平线；手机号标题不再重复显示付费/TYPE。",
  changes: [
    "票据操作区移除「图片」按钮。",
    "取车时间下移，与手机号组件同一行对齐。",
    "手机号标签仅显示手机号/会员号，付费信息只保留 TYPE 标签。"
  ]
}
