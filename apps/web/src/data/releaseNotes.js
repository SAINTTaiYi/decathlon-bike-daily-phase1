export const APP_VERSION = "5.6.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "业务主操作统一确认中状态",
  summary: "所有提交业务状态的主操作在远端确认期间统一显示黑色勾选确认态，避免重复提交。",
  changes: [
    "维修完毕、已售出、完成和确认取车均在提交期间显示“确认中…”，并由单次守卫防止重复或跨记录提交。",
    "自提取货码与闭店确认入口使用相同的勾选确认态；编辑、删除、筛选和导航保持各自原有交互语义。",
    "确认取车仍独享服务端成功后的像素填黑完成动画；reduced-motion 不额外延长等待。"
  ]
}
