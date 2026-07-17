export const APP_VERSION = "5.4.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "日报图疏密与销售四行比例",
  summary: "票据内状态/正文/高亮块/付费行拉开间距；销售区按标题:金额:明细:备注 3:2:1:1 收紧；长图底部加大留白。",
  changes: [
    "状态标签、详情、手机号高亮块与付费行之间加大呼吸间距。",
    "销售区纵向 3:2:1:1，指标数字缩小为等宽小格，不再占半屏。",
    "导出长图底部安全留白增至约 280px，末条记录不再贴边。"
  ]
}
