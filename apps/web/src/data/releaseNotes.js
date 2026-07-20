export const APP_VERSION = "5.7.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "修正 D1 一致性迁移执行方式",
  summary: "移除 Cloudflare D1 不支持的显式事务语句，确保维修撤回一致性修复可在 Preview 安全迁移。",
  changes: [
    "由 Wrangler 管理 D1 迁移事务，不在 SQL 中使用 BEGIN、COMMIT 或 SAVEPOINT。",
    "保留受影响维修记录的定向审计补偿与运行时一致性保护。"
  ]
}
