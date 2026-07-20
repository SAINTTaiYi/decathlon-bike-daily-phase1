export const APP_VERSION = "5.6.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "优化直删触感与操作栏布局",
  summary: "左滑删除改为嵌入式危险操作控件，并统一记录卡的编辑与主操作为左右并排布局。",
  changes: [
    "删除轨道从整块红色背景调整为浅色承托与独立危险按钮，首点即触发删除。",
    "所有同时具备编辑和主操作的记录卡统一编辑在左、主操作在右且保持同一行。",
    "保留原有原生纵向滚动、电子退场、失败恢复和审计撤回语义。"
  ]
}
