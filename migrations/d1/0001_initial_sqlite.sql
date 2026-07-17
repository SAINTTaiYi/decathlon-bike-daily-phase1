-- D1 / SQLite schema for bike-ops staging
-- Converted from Postgres (supabase/migrations/202607150001_*) without attachments / storage.
-- UUID and timestamps are generated in application code.

PRAGMA foreign_keys = ON;

CREATE TABLE stores (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE store_members (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('operator', 'manager', 'admin')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (store_id, user_id)
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  csrf_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE daily_closings (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL,
  sales_vehicles INTEGER NOT NULL DEFAULT 0 CHECK (sales_vehicles >= 0),
  safety_checks INTEGER NOT NULL DEFAULT 0 CHECK (safety_checks >= 0),
  safety_model TEXT NOT NULL DEFAULT '',
  valid_reviews INTEGER NOT NULL DEFAULT 0 CHECK (valid_reviews >= 0),
  used_sold INTEGER NOT NULL DEFAULT 0 CHECK (used_sold >= 0),
  used_received INTEGER NOT NULL DEFAULT 0 CHECK (used_received >= 0),
  sales_saved_at TEXT,
  sales_saved_by TEXT REFERENCES users(id),
  closing_status TEXT NOT NULL DEFAULT 'open' CHECK (closing_status IN ('open', 'closed')),
  closed_at TEXT,
  closed_by TEXT REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_id, business_date)
);

CREATE TABLE work_items (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pickup', 'handover', 'repair', 'resale')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'completed', 'picked-up', 'sold', 'deleted')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  deleted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX work_items_store_kind_active_idx ON work_items(store_id, kind, updated_at) WHERE deleted_at IS NULL;

CREATE TABLE repair_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'member')),
  contact_ciphertext TEXT NOT NULL,
  contact_fingerprint TEXT,
  repair_type TEXT NOT NULL CHECK (repair_type IN ('质保', '付费', '免费', '门店产品维修')),
  repair_project TEXT NOT NULL,
  pickup_date TEXT,
  repair_status TEXT NOT NULL CHECK (repair_status IN ('维修中', '等待配件', '已开付款单', '已开质保单', '已完成')),
  repair_completed_at TEXT,
  completed_on TEXT,
  completed_at TEXT,
  CHECK (
    (repair_type = '门店产品维修' AND pickup_date IS NULL)
    OR (repair_type <> '门店产品维修' AND pickup_date IS NOT NULL)
  )
);

CREATE TABLE pickup_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  pickup_source TEXT NOT NULL CHECK (pickup_source IN ('self-pickup', 'repair', 'customer-storage')),
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

CREATE TABLE resale_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  resale_stage TEXT NOT NULL DEFAULT 'pending' CHECK (resale_stage IN ('pending', 'listed', 'sold')),
  listed_at TEXT,
  sold_at TEXT
);

CREATE TABLE handover_details (
  work_item_id TEXT PRIMARY KEY NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  completed_on TEXT,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_name_snapshot TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_revision INTEGER,
  business_date TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  reversible INTEGER NOT NULL DEFAULT 0 CHECK (reversible IN (0, 1)),
  reverted_event_id TEXT REFERENCES audit_events(id),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_events_store_created_idx ON audit_events(store_id, created_at);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);
CREATE UNIQUE INDEX audit_event_single_revert_idx ON audit_events(reverted_event_id) WHERE reverted_event_id IS NOT NULL;

CREATE TABLE idempotency_requests (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (store_id, user_id, idempotency_key)
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  imported_by TEXT NOT NULL REFERENCES users(id),
  source_version INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'completed', 'failed')),
  result TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (store_id, source_fingerprint)
);

CREATE TABLE app_releases (
  id TEXT PRIMARY KEY NOT NULL,
  app_version TEXT NOT NULL,
  web_version TEXT NOT NULL,
  api_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  environment TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  deployed_by TEXT NOT NULL
);

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
