-- Handover assignee: any store member can @-assign an active work item to a colleague.
-- The next login of the assignee surfaces a todo popup listing active items assigned to them.
-- Expand-contract: both columns are nullable; existing rows are unaffected.

ALTER TABLE work_items ADD COLUMN assigned_to TEXT REFERENCES users(id);
ALTER TABLE work_items ADD COLUMN assigned_at TEXT;

CREATE INDEX work_items_assignee_active_idx
  ON work_items(store_id, assigned_to)
  WHERE deleted_at IS NULL AND assigned_to IS NOT NULL;
