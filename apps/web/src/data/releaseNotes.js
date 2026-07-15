export const APP_VERSION = "5.3.1"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.15",
  title: "Staging 数据库安全加固",
  summary: "根据真实 Supabase PostgreSQL 17.6 顾问结果保护 migration history，并补齐业务外键覆盖索引。",
  changes: [
    "为 public.bike_ops_schema_migrations 启用 RLS，并撤销 public、anon、authenticated 的表权限。",
    "为附件、审计、闭店、待取、导入、成员和台账的外键补齐覆盖索引。",
    "CI migration 记录计数更新为 3，并将运行时 schema version 提升到 staging_security_indexes。"
  ]
}
