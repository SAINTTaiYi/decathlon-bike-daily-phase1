export const APP_VERSION = "5.5.8"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "顾客暂存与自提改电话号码",
  summary: "将顾客暂存/自提的单号补充信息改为电话号码，并在卡片上显示该电话。",
  changes: [
    "待取表单中“单号或补充信息”改为必填“电话号码”。",
    "顾客暂存与自提卡片显示电话号码。",
    "前后端校验同步要求电话号码不可为空。"
  ]
}
