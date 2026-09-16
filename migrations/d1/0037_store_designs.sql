-- 0037 · 门店设计云端图纸（2026-09-17）
--
-- 需求（用户）：门店设计改完后点「保存到云端」，其他同事下次打开也能继续修改。
-- 此前图纸只存在浏览器 localStorage（本机），换人 / 换设备就看不到，也无法协作。
--
-- 一张表、每店一行（store_id 作主键），payload 是工具导出的整份配置 JSON。
--
-- 门店边界（铁律）：只按会话所属门店读写；请求体里不接受、也不信任任何门店标识，
-- 因此不存在把 A 店图纸写进 B 店的可能（服务层用 auth.storeId，接口层不透传门店参数）。
--
-- 并发：revision 单调递增。写入必须带 expectedRevision（乐观锁）——
--   版本不符返回 409 DESIGN_CONFLICT，前端提示「先载入云端最新版本」，
--   避免同事之间互相静默覆盖。
--
-- 刻意不写 audit_events：audit_module 的 CHECK 只允许 8 个既有模块，扩列要重建
-- 目前最大的核心表（D1 写行预算敏感期不值得，同 food_ledger 的判断）。本表自带
-- revision / updated_at / updated_by / updated_by_name，改动记录已可追溯。
--
-- 纯新增表，不改既有表结构与数据（非破坏性）。
CREATE TABLE store_designs (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_by_name TEXT NOT NULL DEFAULT ''
);
