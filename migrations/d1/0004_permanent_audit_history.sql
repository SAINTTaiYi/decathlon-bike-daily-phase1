-- Durable module classification for the permanent in-app operation history.
-- Wrangler owns the migration transaction; do not add BEGIN / COMMIT statements here.
ALTER TABLE audit_events ADD COLUMN audit_module TEXT NOT NULL DEFAULT 'system'
  CHECK (audit_module IN ('sales', 'closing', 'pickup', 'repair', 'resale', 'handover', 'account', 'system'));

-- Preserve old events and classify them once so filters work across historical data too.
UPDATE audit_events
SET audit_module = CASE
  WHEN action IN ('save-kpi', 'clear-kpi') THEN 'sales'
  WHEN action IN ('close-day', 'reopen-day') THEN 'closing'
  WHEN action IN ('create-user', 'change-password', 'login', 'logout', 'initial-setup') THEN 'account'
  WHEN action IN ('complete-pickup', 'update-pickup-notification') THEN 'pickup'
  WHEN action = 'complete-repair' THEN 'repair'
  WHEN action IN ('complete-resale-listing', 'sell-resale') THEN 'resale'
  WHEN action = 'complete-handover' THEN 'handover'
  WHEN action = 'auto-cleanup' THEN 'system'
  WHEN COALESCE(
    json_extract(after_state, '$.workItem.kind'),
    json_extract(before_state, '$.workItem.kind')
  ) = 'pickup' THEN 'pickup'
  WHEN COALESCE(
    json_extract(after_state, '$.workItem.kind'),
    json_extract(before_state, '$.workItem.kind')
  ) = 'repair' THEN 'repair'
  WHEN COALESCE(
    json_extract(after_state, '$.workItem.kind'),
    json_extract(before_state, '$.workItem.kind')
  ) = 'resale' THEN 'resale'
  WHEN COALESCE(
    json_extract(after_state, '$.workItem.kind'),
    json_extract(before_state, '$.workItem.kind')
  ) = 'handover' THEN 'handover'
  ELSE 'system'
END;

CREATE INDEX audit_events_store_module_date_created_idx
  ON audit_events(store_id, audit_module, business_date, created_at DESC, id DESC);
