export const APP_VERSION = "5.6.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "确认取车改为像素填黑完成态",
  summary: "确认取车成功后以黑色像素方块逐步覆盖整张卡片，再收束为当日保留的黑色记录。",
  changes: [
    "仅确认取车使用像素方块逐步填满卡片，维修、售出与其它完成操作保持原有效果。",
    "服务端取车校验成功后才启动视觉填充，避免失败操作产生错误完成反馈。",
    "填充完成后提交既有黑色保留记录与审计撤回状态，reduced-motion 直接进入最终状态。"
  ]
}
