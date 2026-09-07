-- 0026 · 加入已有门店的申请链路
--
-- 背景：注册流程原先只支持「注册即创建新店」，门店编号已存在时直接 409，
-- 手动创建门店的新员工无法自助加入。
--
-- 新行为：注册命中已生效门店（active 且非自注册占位）→ 完成邮箱验证与设密
-- 后正常创建账号（无成员关系、不下发会话、不能登录），同时写入一条
-- store_join_requests(pending)。目标门店的有效管理员审批（平台管理员兜底）：
-- 批准 → 创建 store_members(operator, active)，账号即可正常登录；
-- 拒绝 → 仅标记申请，账号保持无门店（登录提示联系管理员）。
--
-- 安全模式与 store_transfer_requests 同款：乐观锁 revision、条件原子写、
-- 全程审计。纯新增表，不改既有表结构与数据（非破坏性，无需 expand-contract）。
CREATE TABLE store_join_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  decided_by TEXT,
  decision_reason TEXT,
  decided_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX store_join_requests_store_status_idx ON store_join_requests(store_id, status, created_at ASC);
CREATE INDEX store_join_requests_user_idx ON store_join_requests(user_id, status);
