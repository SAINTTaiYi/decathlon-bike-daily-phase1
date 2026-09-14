-- 0036 · 食品台账读放大优化（2026-09-14）
--
-- 背景（staging 实测 rows_read，单店 1,405 条批次时）：
--   · 默认列表（ORDER BY received_date DESC, id DESC）  2,810 读行/次
--   · overview 全店聚合                                  1,405 读行/次
--   · 临期筛选（按 expires_on 过滤）                     1,325 读行/次
--   三者都随历史线性增长（单店每月约 +200 条批次）。
--
-- 根因：既有两个索引是
--   food_batches_store_status_warn_idx (store_id, status, warn_on)
--   food_batches_store_item_idx       (store_id, item_code, received_date)
-- 默认排序用的 received_date（第二索引里在第 3 列，且 store_id 前缀后直接跟
-- item_code）与临期过滤用的 expires_on 都用不上可用前缀，退化为全店扫描
-- （默认排序还会叠加 TEMP B-TREE）。
--
-- 改动一：补 (store_id, received_date DESC, id DESC)，让默认排序直接走索引。
--   实测 2,810 → 101 读行。
-- 改动二：补 (store_id, status, expires_on)，让过期 / 临期计数按 expires_on 走索引。
--   实测临期 1,325 → 67、过期 1,361 → 2 读行。
-- 改动三：food_ledger_counters —— total / open_total 是对全店行的聚合
--   （open 占 97%），任何索引都省不掉全扫（实测 1,405）。改为写路径增量维护：
--   登记 +1、状态流转 ±1。这两个计数与「今天」无关，不随日期漂移，
--   因此不需要每日重算（对比 flagged / soon 依赖 today，仍走实时查询）。
--   读侧计数器缺失时回退为实时聚合且不写库（只读会话安全，例如外部批量导入后）。
--
-- 门店边界：计数器与 food_batches 同为门店数据，主键即 store_id，
-- 只按 store_id 读写，绝不跨店。
--
-- 纯新增：两个索引 + 一张表，不改既有表结构与数据（非破坏性）。

CREATE INDEX food_batches_store_received_idx
  ON food_batches(store_id, received_date DESC, id DESC);

CREATE INDEX food_batches_store_status_expires_idx
  ON food_batches(store_id, status, expires_on);

CREATE TABLE food_ledger_counters (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  total INTEGER NOT NULL DEFAULT 0,
  open_total INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 回填：按现有批次初始化计数（迁移时一次性全扫，此后走增量）。
-- 没有任何批次的门店不建行，读侧回退实时聚合，首次登记时由 UPSERT 建行。
INSERT INTO food_ledger_counters (store_id, total, open_total, updated_at)
SELECT
  store_id,
  COUNT(*),
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM food_batches
GROUP BY store_id;
