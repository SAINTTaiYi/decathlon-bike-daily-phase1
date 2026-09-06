-- BI 定时拉取 + KPI 自动填写（2026-09-06）：
-- ①bi_store_week：CIS 已完结周实销（perfeco STORES + SPD），每周一条。
--   周六关店后该周完结，cron 在下一个营业窗口自动拉取落库；周内实时数据仍由
--   bi_bikes_snapshot 既有缓存承载，本表只存「已完结周」的定案值。
-- ②bi_service_day：CIS 服务 SKU 当日开单量（安全检查 8538631 = DEPOSIT CHECK，
--   icare 服务目录与 masterdata 双重确认），闭店 KPI「安全检查开单」自动填写数据源。
CREATE TABLE bi_store_week (
  store_id TEXT NOT NULL,
  week_from TEXT NOT NULL,
  week_to TEXT NOT NULL,
  week_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'pending', 'failed')),
  payload TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (store_id, week_from)
);
CREATE INDEX bi_store_week_captured_idx ON bi_store_week (store_id, captured_at DESC);

CREATE TABLE bi_service_day (
  store_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  payload TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (store_id, business_date)
);
