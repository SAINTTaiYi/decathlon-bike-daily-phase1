export const APP_VERSION = "5.2.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "Staging 云连接兼容性加固",
  summary: "将 Supabase migration 切换到 GitHub Actions 可达的 IPv4 session pooler，并校正 Organization slug 与 Railway runtime Secret 边界。",
  changes: [
    "Migration 改用 MIGRATION_DATABASE_URL 与 Supavisor session pooler 5432，避免 GitHub-hosted runner 访问默认 IPv6-only direct host。",
    "Supabase 项目创建 Secret 正名为 SUPABASE_ORG_SLUG，并增加回归策略防止误填 UUID。",
    "迁移专用数据库 URL 不再注入 Railway API runtime；新增逐平台 Staging 开户、权限、备份与 14+1 Secret 配置清单。"
  ]
}
