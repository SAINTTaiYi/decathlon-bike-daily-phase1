-- 0028：自愈冷却专用时间戳（2026-09-08 三功能失效事故）
-- 根因：healShipHubConnections 的冷却复用 shiphub_connections.updated_at，而 cube
-- token 每小时刷新、手动同步失败、token 轮换都写同一列，把 30 分钟冷却实际推成
-- 40-45 分钟——token 死亡期间待取车看板与 BI 拉取整段停摆。
-- 专用列 heal_last_attempted_at 只由自愈路径读写：常规重试间隔 5 分钟（上游 token
-- 轮换竞态一次重登通常即恢复），SELF_HEAL_FAILED 后退避 30 分钟（上游登录有风控）。
-- 只追加列，不回填不改写既有数据。
ALTER TABLE shiphub_connections ADD COLUMN heal_last_attempted_at TEXT;
