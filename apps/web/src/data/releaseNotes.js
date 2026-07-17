export const APP_VERSION = "5.4.4"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "日报图疏密 + Preview 身份收敛",
  summary: "票据拉开间距；销售区 3:2:1:1；底部留白；/health/ready 与 meta 走公开配置，部署校验带重试。",
  changes: [
    "状态、详情、手机号高亮与付费行间距加大。",
    "销售区纵向 3:2:1:1，指标等宽小格。",
    "长图底部安全留白约 280px。",
    "Preview/Staging 部署后身份校验轮询收敛；ready 与 live/meta 一样读 plain vars。"
  ]
}
