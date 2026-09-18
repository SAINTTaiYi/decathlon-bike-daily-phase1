-- 0038 · 食品自动登记影子系统（2026-09-18）
--
-- 用户定案：先上「影子系统」——只做自动登记，算法在 CF 侧执行（不依赖 Termux），
-- 结果写影子表，人工核验后再转正式台账（food_batches 不动）。
--
-- 链路：收货单（stock-reception）→ 扫描计划（区段表）→ RDS 分段扫描
--      → 批次判定（整箱爆点）→ 影子表落库。
--
-- 表职责：
--   food_auto_runs    每次「自动登记」运行的一条记录（含到货清单与统计）
--   food_auto_shadow  算法产出的批次行（含候选证据，供人工逐条核验）
--
-- 门店边界（铁律）：两张表都是门店数据，永远按 store_id 过滤；
-- 上游凭据（SNB / Cube）由部署级 secret 提供，仅绑定门店（FOOD_AUTO_BOUND_STORE）
-- 可调用该链路，其它门店一律 403。
--
-- 纯新增表，不改既有表结构与数据（非破坏性）。
CREATE TABLE food_auto_runs (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('done', 'failed')),
  source TEXT NOT NULL DEFAULT 'manual',
  reception_ids TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  stats_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE INDEX food_auto_runs_store_idx ON food_auto_runs (store_id, finished_at DESC);

CREATE TABLE food_auto_shadow (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES food_auto_runs(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL DEFAULT '',
  quantity REAL,
  production_date TEXT,
  expiry_date TEXT,
  warn_on TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  candidates_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX food_auto_shadow_run_idx ON food_auto_shadow (run_id);
CREATE INDEX food_auto_shadow_store_idx ON food_auto_shadow (store_id, created_at DESC);
