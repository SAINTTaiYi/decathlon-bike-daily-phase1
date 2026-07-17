export const APP_VERSION = "5.3.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.18",
  title: "GitHub 直连 Cloudflare 发布",
  summary: "把 Staging 发布改为 GitHub Actions + Wrangler 直传，去掉手机分片中转。",
  changes: [
    "Cloudflare Account ID 与 Staging URL 改为 Environment Variable。",
    "部署工作流读取 STAGING_BASE_URL，直接 wrangler deploy 并自动验收。",
    "补齐治理断言，为一次性 API Token 高速发布路径铺路。"
  ]
}
