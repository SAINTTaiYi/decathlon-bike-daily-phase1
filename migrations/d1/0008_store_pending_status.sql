-- 0008_store_pending_status.sql
-- 门店审核制：新门店先进入「待审核」（pending），由 CHU13 审核批准后生效（active）。
-- SQLite 无法修改 CHECK 约束，需重建 stores 表；沿用 0006 对 store_members 的
-- RENAME -> CREATE -> INSERT -> DROP 模式，保留全部既有数据与 city_id 外键。

ALTER TABLE stores RENAME TO stores_legacy;

CREATE TABLE stores (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  city_id TEXT REFERENCES cities(id) ON DELETE RESTRICT
);

INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at, city_id)
SELECT id, code, name, timezone, status, created_at, updated_at, city_id
FROM stores_legacy;

DROP TABLE stores_legacy;

CREATE INDEX stores_city_active_idx ON stores(city_id, status, code);
