export const APP_VERSION = "5.8.3"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.23",
  title: "Signal Grid 操作与管理体系",
  summary: "统一表单、Dialog、筛选、任务状态、永久历史、账户与设置的模块化操作语法。",
  changes: [
    "所有原生 Dialog 接入模块信号注册条与平面任务层。",
    "加载、错误、成功和空状态统一为可访问的 SignalTaskState。",
    "永久历史筛选、账户创建、迁移和附件管理采用一致组件与状态反馈。",
    "保留现有业务动作、权限、API、D1、审计和完成动效。"
  ]
}
