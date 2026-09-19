-- 上游诊断（2026-09-19）：同步失败时记录上游响应的定位信息
-- （HTTP 状态 + 请求路径 + 响应片段，截断 320 字符），用于定位门店级上游故障
-- （如 1670 门店 pick/ship 的持续失败——仅有错误码无法区分 4xx/5xx 及上游理由）。
-- 仅诊断用途，不参与业务逻辑；由 shiphub-sync 的失败路径写入。
-- Wrangler owns the migration transaction; do not add BEGIN / COMMIT here.

ALTER TABLE shiphub_sync_runs ADD COLUMN error_detail TEXT;
