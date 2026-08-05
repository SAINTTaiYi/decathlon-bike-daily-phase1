-- 0008_store_pending_status.sql
-- 门店审核制：新门店先进入「待审核」，由 CHU13 审核批准后生效。
--
-- stores 是 store_members / work_items / audit_events 等表的父表。SQLite 在
-- ALTER TABLE RENAME 时会改写子表 REFERENCES 指向 legacy 名，D1 实测该模式
-- 会失败（FOREIGN KEY constraint failed）；修改 status 的 CHECK 约束又必须
-- 重建父表。因此本迁移改为新增轻量列，不做表重建：
--   pending_review = 1 表示待审核（展示层派生为 status='pending'）
--   批准 → status='active' 且 pending_review=0
--   拒绝 → status='disabled' 且 pending_review=0
-- 迁移仅 ADD COLUMN + 建索引，无外键风险，D1 兼容。

ALTER TABLE stores ADD COLUMN pending_review INTEGER NOT NULL DEFAULT 0;

CREATE INDEX stores_pending_review_idx ON stores(pending_review, created_at DESC) WHERE pending_review = 1;
