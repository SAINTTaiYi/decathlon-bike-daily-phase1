export const APP_VERSION = "5.7.2"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "兼容 Safari 登录并强制跳转 HTTPS",
  summary: "为不支持 crypto.randomUUID 的 Safari 提供安全降级，并让 HTTP 访问在 Worker 层永久跳转 HTTPS。",
  changes: [
    "写操作的幂等键在 crypto.randomUUID 缺失时改用 getRandomValues 生成标准 UUID v4，避免旧版或非安全上下文 Safari 登录报错。",
    "Cloudflare Worker 接管静态页面请求，HTTP URL 以 308 保留路径和查询参数跳转 HTTPS，HTTPS 页面继续由 ASSETS 服务。",
    "Preview 与 Staging 发布配置均启用 Worker-first 路由，确保 HTTP 重定向逻辑覆盖页面访问。"
  ]
}
