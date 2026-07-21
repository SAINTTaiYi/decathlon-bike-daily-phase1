export const APP_VERSION = "5.7.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.22",
  title: "修复维修完成状态约束",
  summary: "修复非门店维修转待取时内部状态触发 D1 约束并导致服务错误的问题。",
  changes: [
    "维修完毕后继续以工作项状态显示维修完成，不再向受约束的内部维修状态写入该值。",
    "编辑已转待取的维修记录时保留用户可见维修完成状态，内部维修状态继续使用数据库允许值。"
  ]
}
