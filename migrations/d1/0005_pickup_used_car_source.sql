-- Add the durable used-car Pending Pickup source without weakening exact source validation.
-- SQLite cannot alter a CHECK constraint in place, so rebuild only pickup_details and preserve all rows.
-- Wrangler owns the migration transaction; do not add BEGIN / COMMIT here.

ALTER TABLE pickup_details RENAME TO pickup_details_before_used_car_source;

CREATE TABLE pickup_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  pickup_source TEXT NOT NULL CHECK (pickup_source IN ('self-pickup', 'repair', 'customer-storage', 'used-car')),
  self_pickup_platform TEXT CHECK (self_pickup_platform IN ('tmall', 'jd', 'mini-program') OR self_pickup_platform IS NULL),
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'notified')),
  repair_work_item_id TEXT REFERENCES work_items(id),
  picked_up_on TEXT,
  picked_up_at TEXT,
  picked_up_by TEXT REFERENCES users(id),
  CHECK (
    (pickup_source = 'self-pickup' AND self_pickup_platform IS NOT NULL)
    OR (pickup_source <> 'self-pickup' AND self_pickup_platform IS NULL)
  )
);

INSERT INTO pickup_details (
  work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id,
  picked_up_on, picked_up_at, picked_up_by
)
SELECT
  work_item_id, pickup_source, self_pickup_platform, notification_status, repair_work_item_id,
  picked_up_on, picked_up_at, picked_up_by
FROM pickup_details_before_used_car_source;

DROP TABLE pickup_details_before_used_car_source;
