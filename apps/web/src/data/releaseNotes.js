export const APP_VERSION = "5.5.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "管理后台视觉系统改版",
  summary: "以瑞士网格和 Workshop Ledger 层级重构全后台，新增稳定工单号与可扫描的维修项目列表。",
  changes: [
    "全局刊头、闭店摘要、六个业务模块、表单、弹窗与底部导航统一为更克制的黑白工业档案系统。",
    "维修票据按车型、#工单号、Maintenance 项目和低权重事实组建立三级信息层级。",
    "D1 新增门店内稳定递增的工单号，并在 Preview/Staging 发布前自动应用迁移。"
  ]
}
