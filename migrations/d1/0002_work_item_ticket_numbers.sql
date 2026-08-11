-- Stable human-readable work-order numbers per store.
-- Existing rows retain their creation order; future rows allocate atomically.

ALTER TABLE work_items ADD COLUMN ticket_no INTEGER;

UPDATE work_items
SET ticket_no = rowid
WHERE ticket_no IS NULL;

CREATE UNIQUE INDEX work_items_store_ticket_no_idx
ON work_items(store_id, ticket_no);

CREATE TABLE work_item_counters (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

INSERT INTO work_item_counters (store_id, last_value)
SELECT store_id, MAX(ticket_no)
FROM work_items
GROUP BY store_id;
