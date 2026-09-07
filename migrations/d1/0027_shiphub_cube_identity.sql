-- 0027：门店 Cube 身份列（2026-09-08 per-store BI/Cube 派生身份）
-- 门店提交本店 ShipHub 账密后，同一账号可登录 oxylane IdP（CubeInStore 客户端）
-- 取得原生受众 JWT，驱动 perfeco/masterdata——凭据属于谁就只拉谁。
-- 本迁移只在 shiphub_connections 上追加列，不回填不改写既有数据。
ALTER TABLE shiphub_connections ADD COLUMN cube_token_ciphertext TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_token_nonce TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_token_key_version TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_token_expires_at TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_auth_status TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_auth_error_code TEXT;
ALTER TABLE shiphub_connections ADD COLUMN cube_auth_checked_at TEXT;
