export const APP_VERSION = "5.3.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "增加独立预览发布通道",
  summary: "后续更新先部署到独立 Preview 供人工验收，确认后再更新 Staging。",
  changes: [
    "新增 Cloudflare Preview 工作流与独立 D1/Worker。",
    "Preview 与 Staging 分离，避免预览覆盖线上验收环境。",
    "更新治理策略与测试，强制 Preview 仅手动触发。"
  ]
}
