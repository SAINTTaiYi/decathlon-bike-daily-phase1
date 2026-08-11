-- Governed store directory, self-service registration, platform approvals, and target-store transfers.
-- This is forward-only. Existing users/memberships remain valid and gain active membership state.

CREATE TABLE regions (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cities (
  id TEXT PRIMARY KEY NOT NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (region_id, normalized_name)
);

ALTER TABLE stores ADD COLUMN city_id TEXT REFERENCES cities(id) ON DELETE RESTRICT;
ALTER TABLE users ADD COLUMN email_key TEXT;
ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0, 1));

-- A user may return to a former store, so replace the old `(store_id, user_id)` primary key
-- with a stable membership id and retain inactive history.
ALTER TABLE store_members RENAME TO store_members_legacy;
CREATE TABLE store_members (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('operator', 'manager', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  ended_by TEXT REFERENCES users(id),
  end_reason TEXT
);
-- The legacy model permitted more than one membership per user. The governed model has
-- one current store: retain the same earliest membership the legacy login selected and
-- preserve every other legacy membership as inactive history instead of dropping it.
INSERT INTO store_members (id, store_id, user_id, role, status, effective_from, effective_to, created_at, end_reason)
SELECT
  'legacy-' || store_id || '-' || user_id,
  store_id,
  user_id,
  role,
  CASE WHEN membership_rank = 1 THEN 'active' ELSE 'inactive' END,
  created_at,
  CASE WHEN membership_rank = 1 THEN NULL ELSE created_at END,
  created_at,
  CASE WHEN membership_rank = 1 THEN NULL ELSE '迁移：统一单一当前门店关系' END
FROM (
  SELECT store_id, user_id, role, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, store_id ASC) AS membership_rank
  FROM store_members_legacy
);
DROP TABLE store_members_legacy;

CREATE UNIQUE INDEX users_email_key_unique_idx ON users(email_key) WHERE email_key IS NOT NULL;
CREATE UNIQUE INDEX users_one_platform_admin_idx ON users(is_platform_admin) WHERE is_platform_admin = 1;
CREATE UNIQUE INDEX store_members_one_active_user_idx ON store_members(user_id) WHERE status = 'active';
CREATE INDEX stores_city_active_idx ON stores(city_id, status, code);
CREATE INDEX store_members_active_store_role_idx ON store_members(store_id, role, user_id) WHERE status = 'active';

CREATE TABLE registration_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  email_key TEXT NOT NULL,
  username_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  otp_hash TEXT NOT NULL,
  completion_token_hash TEXT,
  client_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'completed', 'expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX registration_challenges_email_created_idx ON registration_challenges(email_key, created_at DESC);
CREATE INDEX registration_challenges_client_created_idx ON registration_challenges(client_hash, created_at DESC) WHERE client_hash IS NOT NULL;

CREATE TABLE role_change_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_role TEXT NOT NULL CHECK (from_role IN ('operator', 'manager', 'admin')),
  target_role TEXT NOT NULL CHECK (target_role IN ('manager', 'admin')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_reason TEXT,
  decided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX role_change_requests_one_pending_idx ON role_change_requests(user_id, store_id) WHERE status = 'pending';
CREATE INDEX role_change_requests_status_created_idx ON role_change_requests(status, created_at DESC);

CREATE TABLE store_transfer_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  target_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_reason TEXT,
  decided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source_store_id <> target_store_id)
);
CREATE UNIQUE INDEX store_transfer_requests_one_pending_idx ON store_transfer_requests(user_id) WHERE status = 'pending';
CREATE INDEX store_transfer_requests_target_status_idx ON store_transfer_requests(target_store_id, status, created_at DESC);

INSERT OR IGNORE INTO regions (id, name, normalized_name, status, sort_order, created_at, updated_at)
VALUES ('30000000-0000-4000-8000-000000000001', '南区', '南区', 'active', 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO cities (id, region_id, name, normalized_name, status, sort_order, created_at, updated_at)
VALUES ('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '广西', '广西', 'active', 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Reuse a legacy record when its globally unique store code already exists. This preserves
-- its stable store id and historical references while making it selectable in the new directory.
INSERT INTO stores (id, code, name, timezone, status, created_at, updated_at, city_id)
VALUES
  ('30000000-0000-4000-8000-000000001299', '1299', '五象店', 'Asia/Shanghai', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000001670', '1670', '民族东店', 'Asia/Shanghai', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000994', '994', '穿山店', 'Asia/Shanghai', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000001249', '1249', '河东店', 'Asia/Shanghai', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '30000000-0000-4000-8000-000000000002')
ON CONFLICT(code) DO UPDATE SET city_id = excluded.city_id, updated_at = excluded.updated_at;
