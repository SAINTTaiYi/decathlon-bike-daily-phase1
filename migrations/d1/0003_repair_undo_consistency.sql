-- Repair historical non-store repair records affected by the pre-V5.7.0 undo defect.
-- The earlier implementation restored work_items but left a pickup_details row behind.
-- A later complete-repair then changed the work item before failing on that duplicate detail row,
-- leaving the record in Pickup without an audit event. Recreate only that missing, reversible audit edge.

BEGIN IMMEDIATE;

WITH missing_completion AS (
  SELECT
    completed.store_id,
    completed.entity_id,
    completed.business_date,
    completed.before_state,
    completed.after_state,
    item.title,
    item.revision
  FROM audit_events AS completed
  JOIN audit_events AS undone ON undone.reverted_event_id = completed.id
  JOIN work_items AS item ON item.id = completed.entity_id AND item.store_id = completed.store_id
  JOIN pickup_details AS pickup ON pickup.work_item_id = item.id AND pickup.pickup_source = 'repair'
  WHERE completed.action = 'complete-repair'
    AND completed.entity_type = 'work-item'
    AND item.kind = 'pickup'
    AND item.lifecycle = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM audit_events AS later
      WHERE later.store_id = completed.store_id
        AND later.entity_type = 'work-item'
        AND later.entity_id = completed.entity_id
        AND later.created_at > undone.created_at
    )
)
INSERT INTO audit_events (
  id, store_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, entity_revision,
  business_date, summary, before_state, after_state, reversible, reverted_event_id, request_id, created_at
)
SELECT
  lower(hex(randomblob(16))),
  store_id,
  NULL,
  '系统修复',
  'recover-complete-repair',
  'work-item',
  entity_id,
  revision,
  business_date,
  '修复记录：维修完毕并转入待取：' || title,
  before_state,
  after_state,
  1,
  NULL,
  lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM missing_completion;

COMMIT;
