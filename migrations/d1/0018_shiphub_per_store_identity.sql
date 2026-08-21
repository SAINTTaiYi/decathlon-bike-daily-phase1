-- 每店独立上游身份（2026-08-21 渗透复盘）：
-- 1) login_username_enc / login_password_enc / login_key_version：本店专属的 ShipHub
--    门店账号凭据（AES-256-GCM，复用 SHIPHUB_TOKEN_ENCRYPTION_KEY），连接时由门店
--    管理员填写；不填则回退到部署级共享凭据（仅兼容存量连接，新连接推荐填写）。
-- 2) location_num：本店专属上游门店编号；不填回退到部署级 SHIPHUB_LOCATION_NUM。
-- 3) identity_fingerprint：sha256(location_num + 登录账号) 或 sha256('legacy:' + location_num)，
--    用于识别"同一上游身份"：connect 时拒绝已被其他门店占用的身份；
--    同步刷新 token 前按 fingerprint 取全局互斥租约，杜绝共享 token 并发轮换打废整个 token 族。
ALTER TABLE shiphub_connections ADD COLUMN login_username_enc TEXT;
ALTER TABLE shiphub_connections ADD COLUMN login_password_enc TEXT;
ALTER TABLE shiphub_connections ADD COLUMN login_key_version TEXT;
ALTER TABLE shiphub_connections ADD COLUMN location_num TEXT;
ALTER TABLE shiphub_connections ADD COLUMN identity_fingerprint TEXT;
CREATE INDEX idx_shiphub_connections_fingerprint ON shiphub_connections(identity_fingerprint);

CREATE TABLE shiphub_identity_leases (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
