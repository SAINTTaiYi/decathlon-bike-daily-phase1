-- 0035 · 食品 / 非食品保质期台账（2026-09-13）
--
-- 把门店现用的 Excel 台账《五象食品&产品台账登记本》搬进 ops：两个新表，
-- 对应表里两部分——「保质期【清单】」是全局商品字典，两个 2026 台账页是门店批次。
--
-- 口径（与 Excel 公式逐年逐月一致，实现见 packages/domain/src/food.js）：
--   食品类：            预警日 = EDATE(生产日期, 保质期月数 - 1)
--   非食品·生产日期：    预警日 = EDATE(生产日期, 保质期月数 - 1)
--   非食品·限制使用日期： 预警日 = EDATE(限制使用日期, -1)
--   到期日：生产日期口径 EDATE(生产日期, 保质期月数)；限制使用日期口径即该日期本身。
-- 预警日 / 到期日一律由服务端计算后落库（登记与导入共用同一函数），前端只展示，
-- 避免两端各算一遍产生口径漂移。
--
-- 门店边界（铁律）：food_shelf_life 是全局商品字典（同 BI SKU 名），不含任何
-- 门店经营数据；food_batches 是门店数据，永远按 store_id 过滤，绝不跨店可见。
-- 注册门店不会被自动灌入任何批次（导入脚本显式绑定门店）。
--
-- 纯新增表，不改既有表结构与数据（非破坏性，无需 expand-contract）。
CREATE TABLE food_shelf_life (
  item_code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  shelf_life_months REAL NOT NULL CHECK (shelf_life_months > 0),
  category TEXT NOT NULL DEFAULT '',
  pack_size REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE food_batches (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('food', 'nonfood')),
  date_type TEXT NOT NULL CHECK (date_type IN ('production', 'restricted')),
  production_date TEXT,
  restricted_date TEXT,
  received_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  receiver TEXT NOT NULL DEFAULT '',
  warn_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sold_out', 'isolated')),
  checked_at TEXT,
  checked_by TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 红标待办（首页）：status = 'open' 且 warn_on <= 今天，按预警日升序；同时服务计数。
CREATE INDEX food_batches_store_status_warn_idx ON food_batches(store_id, status, warn_on ASC);
-- 按商品回看批次（同一 item 的历史收货 / 处理记录）。
CREATE INDEX food_batches_store_item_idx ON food_batches(store_id, item_code, received_date DESC);
