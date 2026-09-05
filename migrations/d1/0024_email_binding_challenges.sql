-- 0024 · 登录态强制邮箱绑定验证挑战
--
-- 面向早期手工创建、没有 email_key 的存量账号：下次登录强制绑定公司邮箱
-- 并重设密码（允许与旧密码一致）。与 registration_challenges /
-- password_reset_challenges 平行但语义独立：本表通向 UPDATE
-- users.email_key + password_hash，绝不能与另两条链路复用，否则一条
-- 链路的令牌可以在另一条链路上兑现。
--
-- 纯新增表，不改动既有表结构与数据（非破坏性，无需 expand-contract）。
CREATE TABLE email_binding_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_key TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  client_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 速率限制与预算查询：按用户统计最近窗口内的发码与错误验证码次数。
CREATE INDEX email_binding_user_created_idx ON email_binding_challenges(user_id, created_at DESC);
CREATE INDEX email_binding_email_created_idx ON email_binding_challenges(email_key, created_at DESC);
