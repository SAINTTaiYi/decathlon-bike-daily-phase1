-- Admin console query indexes.
-- Forward-only and additive: no table, column, or row is modified.
--
-- Every index below was kept only because EXPLAIN QUERY PLAN confirmed SQLite
-- actually selects it. Indexes that looked reasonable but were not chosen were
-- dropped from this migration rather than shipped as dead weight:
--
--   * role_change_requests(created_at DESC, id DESC) and the store_transfer
--     equivalent were intended to remove the TEMP B-TREE from the approval
--     "decided" group. They do not: that query filters on
--     status IN ('approved','rejected','cancelled') and orders across all three
--     values, so SQLite probes the status index and always sorts afterwards.
--     The sort is bounded by LIMIT 21 per page, so it is left alone.
--   * store_members(user_id, store_id, role) was redundant against the existing
--     unique partial index store_members_one_active_user_idx(user_id).

-- Overview counts today's and 7/30-day approvals with
-- "status = 'approved' AND decided_at >= ?". decided_at had no index at all, so
-- every overview load scanned both request tables in full. Confirmed as a
-- COVERING INDEX search on (status=? AND decided_at>?).
CREATE INDEX IF NOT EXISTS role_change_requests_status_decided_idx
  ON role_change_requests(status, decided_at)
  WHERE decided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_transfer_requests_status_decided_idx
  ON store_transfer_requests(status, decided_at)
  WHERE decided_at IS NOT NULL;

-- Per-store role statistics filter on a date window and group by store_id.
CREATE INDEX IF NOT EXISTS role_change_requests_store_created_idx
  ON role_change_requests(store_id, created_at DESC);

-- Users list pages with a stable (created_at DESC, id DESC) cursor.
-- Confirmed as a COVERING INDEX walk, which removes the previous sort.
CREATE INDEX IF NOT EXISTS users_created_id_idx
  ON users(created_at DESC, id DESC);
