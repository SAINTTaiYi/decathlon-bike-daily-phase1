export const APP_VERSION = "5.8.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.23",
  title: "Signal Grid 媒体与报告",
  summary: "预生成模块双色媒体并重构闭店日报的汇总、明细与压缩输出。",
  changes: [
    "Overview 主图使用 AVIF/WebP 预处理双色抖动资源，私有缩略图继承模块信号。",
    "闭店日报采用真实模块色汇总和冷白高对比明细，保留服务器快照与自提标识。",
    "新增媒体完整性、聊天压缩、灰度对比与代表性 Canvas 渲染回归门。"
  ]
}
