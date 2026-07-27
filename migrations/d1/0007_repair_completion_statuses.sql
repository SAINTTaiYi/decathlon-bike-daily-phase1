-- Preserve the exact pre-completion billing reminder while moving repairs into Pending Pickup.
-- SQLite cannot alter a CHECK constraint in place, so rebuild repair_details and migrate legacy aliases.
-- Wrangler owns the migration transaction; do not add BEGIN / COMMIT here.

ALTER TABLE repair_details RENAME TO repair_details_before_completion_statuses;

CREATE TABLE repair_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'member')),
  contact_ciphertext TEXT NOT NULL,
  contact_fingerprint TEXT,
  repair_type TEXT NOT NULL CHECK (repair_type IN ('质保', '付费', '免费', '门店产品维修')),
  repair_project TEXT NOT NULL,
  pickup_date TEXT,
  repair_status TEXT NOT NULL CHECK (repair_status IN (
    '维修中', '等待配件',
    '已开付款单', '已开维修单', '已开质保维修单', '已开质保付款单-请过机', '快速服务免费',
    '维修完成-已开付款单', '维修完成-已开维修单', '维修完成-已开质保维修单',
    '维修完成-已开质保付款单-请过机', '维修完成-快速服务免费',
    '已开质保单', '维修完成', '已完成'
  )),
  repair_completed_at TEXT,
  completed_on TEXT,
  completed_at TEXT,
  CHECK (
    (repair_type = '门店产品维修' AND pickup_date IS NULL)
    OR (repair_type <> '门店产品维修' AND pickup_date IS NOT NULL)
  )
);

INSERT INTO repair_details (
  work_item_id, contact_type, contact_ciphertext, contact_fingerprint, repair_type, repair_project,
  pickup_date, repair_status, repair_completed_at, completed_on, completed_at
)
SELECT
  r.work_item_id, r.contact_type, r.contact_ciphertext, r.contact_fingerprint, r.repair_type, r.repair_project,
  r.pickup_date,
  CASE
    WHEN w.kind = 'pickup' AND w.lifecycle = 'active' AND p.pickup_source = 'repair' THEN
      CASE
        WHEN r.repair_status = '已开付款单' THEN '维修完成-已开付款单'
        WHEN r.repair_status IN ('已开质保单', '已开质保维修单') THEN '维修完成-已开质保维修单'
        WHEN r.repair_status = '已开质保付款单-请过机' THEN '维修完成-已开质保付款单-请过机'
        WHEN r.repair_status = '快速服务免费' OR r.repair_type = '免费' THEN '维修完成-快速服务免费'
        WHEN r.repair_type = '质保' THEN '维修完成-已开质保维修单'
        ELSE '维修完成-已开维修单'
      END
    WHEN r.repair_status = '已开质保单' THEN '已开质保维修单'
    ELSE r.repair_status
  END,
  r.repair_completed_at, r.completed_on, r.completed_at
FROM repair_details_before_completion_statuses r
JOIN work_items w ON w.id = r.work_item_id
LEFT JOIN pickup_details p ON p.work_item_id = r.work_item_id;

DROP TABLE repair_details_before_completion_statuses;

UPDATE work_items
SET status = (
  SELECT repair_status FROM repair_details WHERE repair_details.work_item_id = work_items.id
)
WHERE kind = 'pickup'
  AND lifecycle = 'active'
  AND EXISTS (
    SELECT 1 FROM pickup_details
    WHERE pickup_details.work_item_id = work_items.id
      AND pickup_details.pickup_source = 'repair'
  );
