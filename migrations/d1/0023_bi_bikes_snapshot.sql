-- BI 整车销量快照与分类缓存（2026-09-04，perfeco 换源）：
-- ①闭店 KPI 弹窗「填写数据」时自动同步当日新车/二手车台数（perfeco 实销）；
-- ②BI 车型榜换源 perfeco 周实销：families 白名单服务端过滤，只含整车（儿童/山地/公路/
--   折叠/城市/旅行/BMX/平衡车族），轮滑鞋、头盔、手套、脚撑等配件族全部排除；
-- ③Shiphub 闭店日报按 item article 码反查车型名并过滤非整车。
-- article 码（Shiphub item sku、7 位）与 model r3code（8 位主流）是两个 ID 空间，
-- 分别用 bi_article_map / bi_sku_names 缓存，绝不混写。
-- business_date='week' 是周榜缓存行（10 分钟新鲜度复用，避免面板挂载反复登录上游）。
CREATE TABLE bi_bikes_snapshot (
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  new_bikes INTEGER NOT NULL DEFAULT 0,
  used_bikes INTEGER NOT NULL DEFAULT 0,
  new_bikes_to REAL NOT NULL DEFAULT 0,
  used_bikes_to REAL NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '[]',
  week_json TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (store_id, business_date)
);

-- article → model 解析缓存：articleinfos 批量反查结果落库，重复 SKU 零上游调用。
CREATE TABLE bi_article_map (
  article_code TEXT PRIMARY KEY NOT NULL,
  model_code TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

-- bi_sku_names 扩展分类列（model 级）：整车判定与日报过滤共用。
-- is_bike/is_buyback 由 store_treeview.family_id 白名单判定；登录同步的 upsert
-- 不触碰这些列（ON CONFLICT 只更新既有列），分类由 bi-bikes 服务单独 upsert。
ALTER TABLE bi_sku_names ADD COLUMN universe_id INTEGER;
ALTER TABLE bi_sku_names ADD COLUMN family_id INTEGER;
ALTER TABLE bi_sku_names ADD COLUMN is_bike INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bi_sku_names ADD COLUMN is_buyback INTEGER NOT NULL DEFAULT 0;
