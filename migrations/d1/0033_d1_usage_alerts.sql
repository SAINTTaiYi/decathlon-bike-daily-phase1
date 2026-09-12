-- D1 用量告警去重状态（2026-09-13）。
--
-- 背景：2026-09-12 D1 免费层每日写额度被 preview 定时任务烧穿，账号上所有写入被平台
-- 拒绝（7500），但此前没有任何提前信号。现在达到 80%（预警）/ 100%（严重）时发邮件，
-- 本表记录「某 UTC 日、某指标、某档位」是否已经发过，保证每天每档最多一封。
--
-- 只写 1 行/档位，可忽略不计；额度已爆导致写不进时，服务端用内存兜底去重（60 分钟冷却）。
CREATE TABLE d1_usage_alerts (
  dedupe_key TEXT PRIMARY KEY NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('read', 'write')),
  level TEXT NOT NULL CHECK (level IN ('warning', 'critical')),
  value REAL NOT NULL,
  limit_value REAL NOT NULL,
  ratio REAL NOT NULL,
  sent_at TEXT NOT NULL
);
