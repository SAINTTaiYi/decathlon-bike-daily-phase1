-- 0029：门店变更版本号（2026-09-09 实时推送第一批）
-- 目的：让前端从「定时轮询」转为「长轮询 + 版本号」，页面不再需要手动刷新。
-- 机制：每店一行版本号，任何影响门店可见数据的写操作都 bump 一次；
-- 前端带 since=<本地版本号> 挂起等待，服务端发现版本号变大立即返回。
--
-- 设计取舍：
-- ① 每店一行而非每类数据一行——门店数据量小（单店单日千级），
--    粗粒度版本号实现简单且不会漏推；代价是任一变更都会触发全量重拉，
--    但重拉走 D1 且响应体小，可接受。
-- ② 不记录变更详情（no event payload）——避免与业务表双写不一致；
--    前端拿到「变了」信号后自己重新拉权威数据。
-- ③ updated_at 仅作诊断，不参与判定。
CREATE TABLE store_change_log (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
