export const APP_VERSION = "5.9.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.24",
  title: "总览与待取 Endfield 重构",
  summary: "以原创 Endfield Level 2 视觉重构总览与待取车界面，保留全部现有框架结构和操作逻辑。",
  changes: [
    "总览保留真实待办排序与抽象信号场，将销售 KPI、业务地图和主要操作重组为冷白、炭黑与 Solar Yellow 的技术型工作面。",
    "待取车保留来源、通知、日期、校验和取货码确认逻辑，重构模块头、队列摘要、台账、主操作与确认任务层。",
    "补充 Endfield 范围、forced-colors、reduced-motion、输入保护与业务边界静态回归测试。"
  ]
}
