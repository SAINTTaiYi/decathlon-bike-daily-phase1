-- 0030：access token 复用列（2026-09-09 OAUTH_TOKEN_HTTP_400 根因修复）
--
-- 根因（实测报告 /workspace/oauth-400-rootcause-20260909.md）：
-- 同一员工账号有两条独立登录链路——Shiphub 同步（idpdecathlon.decathlon.com.cn +
-- SHIPHUB client，每分钟 × 4 分类刷新 refresh token）与 BI/Cube 身份
-- （idpdecathlon.oxylane.com + MASTERDATA client，cube token 到期时完整重新登录）。
-- PingFederate 的 refresh token 是族级的：重新登录会作废该账号所有旧 refresh token。
-- 于是 BI 重登打废 Shiphub 持有的 RT，下一次同步 400 invalid_grant。
--
-- 放大器：connectionForSync 每个分类都刷新一次 RT（token_expires_at 存了却从不用于
-- 判断），每分钟 4 次轮换把撞车窗口放大 4 倍。
--
-- 修复：缓存 access token。剩余寿命超过刷新阈值时直接复用，不碰 refresh token。
-- RT 刷新频率从 4 次/分钟降到约 1 次/2 小时（access token 有效期 2 小时），
-- 撞车概率下降约 480 倍，上游调用量同步下降。
--
-- 只追加列，不回填不改写既有数据（旧行 access_token_* 为 NULL → 首次走原有刷新路径）。
ALTER TABLE shiphub_connections ADD COLUMN access_token_ciphertext TEXT;
ALTER TABLE shiphub_connections ADD COLUMN access_token_nonce TEXT;
ALTER TABLE shiphub_connections ADD COLUMN access_token_key_version TEXT;
