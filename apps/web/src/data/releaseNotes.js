export const APP_VERSION = "5.3.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "全免费云栈与受控发布",
  summary: "将 Web/API/数据库/私有附件迁移到 EdgeOne Makers Free + Supabase Free，并用迁移先行的专用部署分支建立零付费发布治理。",
  changes: [
    "Fastify API 已适配 EdgeOne Node.js Cloud Functions，与 Vite Web 使用同源 /api 和 /health。",
    "Cloudflare R2 已替换为 Supabase private Storage，上传完成后会重新下载并校验真实 SHA-256。",
    "删除 Railway、Cloudflare Pages/R2、容器和旧 bootstrap；发布改为测试构建、checksum migration、部署分支普通快进与 exact SHA 验收。",
    "Staging/Production 强制 Free/no-billing 隔离，Production 额外要求已验收 Staging、加密导出和恢复演练。"
  ]
}
