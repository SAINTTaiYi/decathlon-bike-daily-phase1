-- Bootstrap 审计 feed 按门店 + 业务日取数（2026-09-03 D1 免费层限额预算）：
-- 当天事件走本索引的 (store_id, business_date) 前缀精确范围；在册记录事件史走
-- 既有 audit_events_entity_idx 点查。旧版「无日期 ORDER BY created_at DESC LIMIT 500」
-- 每次读 1.2k+ 行且随历史总量增长，是 2026-09-02 限额烧穿的查询家族之一。
CREATE INDEX audit_events_store_date_created_idx
  ON audit_events(store_id, business_date, created_at DESC, id DESC);
