-- Shiphub 订单加密标记（虚拟号/隐私号）
-- 自提订单的顾客手机号可能为隐私号（需转接），前端据此展示「虚拟号 · 转接」标识，
-- 避免店员拿虚拟号核对顾客报出的真实尾号。
ALTER TABLE shiphub_orders ADD COLUMN is_encrypted_order INTEGER NOT NULL DEFAULT 0;
