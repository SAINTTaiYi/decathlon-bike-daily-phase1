-- 0025 · 每个邮箱同一时刻只允许一个 pending OTP 挑战
--
-- 渗透 2026-09-06：recovery/registration 发码 60s 冷却可被并发穿透，
-- 同一邮箱同时存在多个 pending 挑战，等于把单挑战 5 次锁定拆成多条计数。
-- 先作废每个邮箱多余的 pending（保留最新一条），再加部分唯一索引。
-- 纯索引约束，不改表列，非破坏性。

UPDATE password_reset_challenges
SET status = 'expired', updated_at = datetime('now')
WHERE status = 'pending'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY email_key ORDER BY created_at DESC, id DESC
      ) AS rn
      FROM password_reset_challenges
      WHERE status = 'pending'
    ) AS newest
    WHERE rn = 1
  );

UPDATE registration_challenges
SET status = 'expired', updated_at = datetime('now')
WHERE status = 'pending'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY email_key ORDER BY created_at DESC, id DESC
      ) AS rn
      FROM registration_challenges
      WHERE status = 'pending'
    ) AS newest
    WHERE rn = 1
  );

CREATE UNIQUE INDEX password_reset_one_pending_email_idx
  ON password_reset_challenges(email_key) WHERE status = 'pending';

CREATE UNIQUE INDEX registration_one_pending_email_idx
  ON registration_challenges(email_key) WHERE status = 'pending';
