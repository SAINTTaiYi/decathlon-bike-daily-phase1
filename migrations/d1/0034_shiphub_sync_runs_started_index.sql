-- shiphub_sync_runs 增加按 started_at 的单列索引（2026-09-13 D1 免费层限额预算）。
-- 既有 shiphub_sync_runs_store_started_idx 是 (store_id, started_at DESC) 复合索引，只能
-- 服务带 store_id 前缀的查询；仅按 started_at 过滤/排序的运维、排查、巡检查询没有可用
-- 前缀：范围查询退化为整索引扫描（preview 实测 69,128 行/次），ORDER BY started_at DESC
-- LIMIT 退化为整表扫描 + 临时 B 树排序，且都随历史总量线性增长。2026-09-13 的 7 条排查
-- 查询因此消耗约 83 万行（占当日免费层读额度 17%）。
-- 本索引让这类查询只读命中区间（近窗口通常个位数行）；门店前缀查询继续走既有复合索引。
CREATE INDEX shiphub_sync_runs_started_idx
  ON shiphub_sync_runs(started_at DESC);
