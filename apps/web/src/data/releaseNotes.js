export const APP_VERSION = "5.2.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "数据库驱动全栈与安全发布",
  summary: "闭店日报升级为数据库驱动的全栈 Monorepo，并建立 Staging/Production 隔离、可恢复基础设施状态与双确认生产发布流程。",
  changes: [
    "正式业务读写接入 Fastify API、Supabase PostgreSQL、真实账号 Session、RBAC、审计撤回与 revision 并发控制。",
    "用户上传附件改用 Cloudflare R2 私有对象与短期签名 URL，数据库只保存受控元数据。",
    "新增幂等 ops CLI、checksum migration runner、Cloudflare Pages/Railway/Supabase/R2 自动化与非敏感阶段检查点。",
    "GitHub Actions 按环境映射 Secret；Production 仅允许 main 手动发布，并要求 Staging 验收 SHA、显式批准和备份确认。",
    "境外 npm、GitHub 与云平台不可达时立即停止并提示开启 VPN，不盲目重试。"
  ]
}
