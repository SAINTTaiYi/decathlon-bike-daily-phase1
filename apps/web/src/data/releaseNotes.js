export const APP_VERSION = "5.7.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "统一全路由编辑式文本进入",
  summary: "以克制的按行标题与整段说明 reveal 取代旧工作台空间动效，保留业务交互反馈。",
  changes: [
    "登录、初始化、改密、同步状态与工作台的品牌刊头、标题和说明统一使用编辑式进入。",
    "标题按真实视觉行播放 500ms 上移淡入，说明保持整段 550ms 上移淡入，并在离开后重新进入视口时重播。",
    "删除工作台 3D、视差和通用卡片 scroll reveal；图片、KPI、业务卡片和功能控件不进入通用文本动效。"
  ]
}
