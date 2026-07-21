export const APP_VERSION = "5.7.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "移动端视口与闭店流程修复",
  summary: "修复 Android 添加车辆页面滚动、浏览器底栏遮挡、闭店权限和维修完成状态。",
  changes: [
    "添加车辆对话框按动态可视视口滚动，固定底栏和提示避开浏览器操作底栏。",
    "所有已登录用户可完成闭店，重新打开闭店仍仅限经理和管理员。",
    "非门店产品维修完成后以维修完成状态转入待取，并保留取车校验与完整维修字段。"
  ]
}
