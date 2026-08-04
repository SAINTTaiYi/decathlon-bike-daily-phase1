export const APP_VERSION = "5.8.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.04",
  title: "交接事项标题紧急修复",
  summary: "紧急修复其它工作交接卡误把历史详情字段显示为标题的问题；既有 D1 数据不改动。",
  changes: [
    "交接卡现在优先展示持久化 title，只有 title 为空才回退 detail。",
    "修复仅涉及客户端显示逻辑，不执行 D1 写入、迁移或历史数据恢复。"
  ]
}
