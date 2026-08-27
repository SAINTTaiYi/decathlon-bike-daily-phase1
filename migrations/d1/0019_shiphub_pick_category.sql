-- Shiphub「待门店拣货」分类（To Pick）：待取车模块需要同时呈现 待取(hand) / 待门店拣货(pick) /
-- 待门店收货=在途(receive) 三类车辆。SQLite 无法原地修改 CHECK 约束，按下述 FK 安全顺序
-- 重建四张带 category CHECK 的表 + 重指 items 外键（expand：纯放宽，无删列，无数据变换）。
-- Wrangler owns the migration transaction; do not add BEGIN / COMMIT here.

-- 1) shiphub_sync_runs（父表先行）：改名腾出表名（shiphub_orders.last_seen_run_id 外键随之改指 _old）
ALTER TABLE shiphub_sync_runs RENAME TO shiphub_sync_runs_rebuild_old;
CREATE TABLE shiphub_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'pick', 'receive', 'ship')),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('scheduled', 'manual', 'authorization')),
  batch_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'skipped', 'failed')),
  pages INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  detail_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
INSERT INTO shiphub_sync_runs (id, store_id, category, trigger_source, batch_id, started_at, finished_at, status, pages, orders, detail_count, error_code)
  SELECT id, store_id, category, trigger_source, batch_id, started_at, finished_at, status, pages, orders, detail_count, error_code
  FROM shiphub_sync_runs_rebuild_old;

-- 2) shiphub_orders：改名（items/actions 外键随之改指 _old），新表外键指向已重建的 shiphub_sync_runs
ALTER TABLE shiphub_orders RENAME TO shiphub_orders_rebuild_old;
CREATE TABLE shiphub_orders (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'pick', 'receive', 'ship')),
  upstream_order_id TEXT NOT NULL,
  display_label TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  order_status TEXT NOT NULL DEFAULT '',
  order_number TEXT,
  customer_phone TEXT,
  vehicle_info TEXT,
  scheduled_at TEXT,
  upstream_updated_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_seen_run_id TEXT REFERENCES shiphub_sync_runs(id),
  upstream_absent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  channel TEXT,
  is_encrypted_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, category, upstream_order_id)
);
INSERT INTO shiphub_orders (store_id, category, upstream_order_id, display_label, source_label, order_status, order_number, customer_phone, vehicle_info, scheduled_at, upstream_updated_at, first_seen_at, last_seen_at, last_seen_run_id, upstream_absent_at, created_at, updated_at, channel, is_encrypted_order)
  SELECT store_id, category, upstream_order_id, display_label, source_label, order_status, order_number, customer_phone, vehicle_info, scheduled_at, upstream_updated_at, first_seen_at, last_seen_at, last_seen_run_id, upstream_absent_at, created_at, updated_at, channel, is_encrypted_order
  FROM shiphub_orders_rebuild_old;

-- 3) shiphub_order_items：无 CHECK 变更，重建只为把外键重指到新 shiphub_orders
ALTER TABLE shiphub_order_items RENAME TO shiphub_order_items_rebuild_old;
CREATE TABLE shiphub_order_items (
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  upstream_order_id TEXT NOT NULL,
  upstream_item_id TEXT NOT NULL,
  product_label TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  vehicle_info TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  serial_number_masked TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, category, upstream_order_id, upstream_item_id),
  FOREIGN KEY (store_id, category, upstream_order_id)
    REFERENCES shiphub_orders(store_id, category, upstream_order_id) ON DELETE CASCADE
);
INSERT INTO shiphub_order_items (store_id, category, upstream_order_id, upstream_item_id, product_label, sku, vehicle_info, quantity, serial_number_masked, image_url, created_at, updated_at)
  SELECT store_id, category, upstream_order_id, upstream_item_id, product_label, sku, vehicle_info, quantity, serial_number_masked, image_url, created_at, updated_at
  FROM shiphub_order_items_rebuild_old;
DROP TABLE shiphub_order_items_rebuild_old;

-- 4) shiphub_order_actions：action_type CHECK 放宽 + 外键重指
ALTER TABLE shiphub_order_actions RENAME TO shiphub_order_actions_rebuild_old;
CREATE TABLE shiphub_order_actions (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  upstream_order_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('pickup', 'pick', 'receive', 'ship')),
  local_state TEXT NOT NULL CHECK (local_state IN ('completed', 'revoked')),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  acted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES users(id),
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id, category, upstream_order_id)
    REFERENCES shiphub_orders(store_id, category, upstream_order_id) ON DELETE CASCADE
);
INSERT INTO shiphub_order_actions (id, store_id, category, upstream_order_id, action_type, local_state, actor_user_id, acted_at, revoked_at, revoked_by, idempotency_key, created_at)
  SELECT id, store_id, category, upstream_order_id, action_type, local_state, actor_user_id, acted_at, revoked_at, revoked_by, idempotency_key, created_at
  FROM shiphub_order_actions_rebuild_old;
DROP TABLE shiphub_order_actions_rebuild_old;

-- 5) 收尾：items/actions 已重指新表，可安全删除旧 orders / sync_runs（不再有子表引用 _old）
DROP TABLE shiphub_orders_rebuild_old;
DROP TABLE shiphub_sync_runs_rebuild_old;

-- 6) 索引随旧表删除而消失，按原定义重建
CREATE INDEX shiphub_sync_runs_store_started_idx ON shiphub_sync_runs(store_id, started_at DESC);
CREATE INDEX shiphub_orders_current_idx
  ON shiphub_orders(store_id, category, updated_at DESC, upstream_order_id DESC)
  WHERE upstream_absent_at IS NULL;
CREATE UNIQUE INDEX shiphub_order_actions_idempotency_idx
  ON shiphub_order_actions(store_id, actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX shiphub_order_actions_current_idx
  ON shiphub_order_actions(store_id, category, upstream_order_id, acted_at DESC);

-- 7) shiphub_category_state：无 shiphub 外键，独立重建
ALTER TABLE shiphub_category_state RENAME TO shiphub_category_state_rebuild_old;
CREATE TABLE shiphub_category_state (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'pick', 'receive', 'ship')),
  last_count INTEGER,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_full_reconcile_at TEXT,
  next_reconcile_at TEXT,
  last_error_code TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, category)
);
INSERT INTO shiphub_category_state (store_id, category, last_count, last_attempt_at, last_success_at, last_full_reconcile_at, next_reconcile_at, last_error_code, consecutive_failures, updated_at)
  SELECT store_id, category, last_count, last_attempt_at, last_success_at, last_full_reconcile_at, next_reconcile_at, last_error_code, consecutive_failures, updated_at
  FROM shiphub_category_state_rebuild_old;
DROP TABLE shiphub_category_state_rebuild_old;
