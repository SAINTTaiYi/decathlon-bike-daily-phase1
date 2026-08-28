-- 0020 · 自助改密（忘记密码）验证挑战
--
-- 与 registration_challenges 平行但语义独立：注册挑战通向 INSERT users，
-- 本表通向 UPDATE users.password_hash，绝不能互相复用，否则一条链路的
-- 令牌可以在另一条链路上兑现。
--
-- 纯新增表，不改动既有表结构与数据（非破坏性，无需 expand-contract）。
CREATE TABLE password_reset_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_key TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  -- 完成令牌与发起端 client_hash 绑定：验证码若被中途截获，异地也无法兑现。
  completion_token_hash TEXT,
  client_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'completed', 'expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 速率限制查询：按邮箱、按发起端分别统计最近窗口内的发码次数。
CREATE INDEX password_reset_email_created_idx ON password_reset_challenges(email_key, created_at DESC);
CREATE INDEX password_reset_client_created_idx ON password_reset_challenges(client_hash, created_at DESC) WHERE client_hash IS NOT NULL;
CREATE INDEX password_reset_user_created_idx ON password_reset_challenges(user_id, created_at DESC);
