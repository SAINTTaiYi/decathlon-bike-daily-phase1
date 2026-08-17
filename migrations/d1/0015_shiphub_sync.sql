-- Shiphub read-only integration foundation.
-- Expand-contract: all objects are additive and nullable/disabled by default.
-- No raw upstream payloads or credentials are stored.

CREATE TABLE shiphub_connections (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  location_ref_ciphertext TEXT,
  location_ref_nonce TEXT,
  location_ref_key_version TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  mode TEXT NOT NULL DEFAULT 'fixture' CHECK (mode IN ('fixture', 'live')),
  refresh_token_ciphertext TEXT,
  refresh_token_nonce TEXT,
  refresh_token_key_version TEXT,
  token_expires_at TEXT,
  token_updated_at TEXT,
  authorization_status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (authorization_status IN ('disconnected', 'connected', 'reauth_required')),
  last_auth_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shiphub_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
  pkce_verifier_ciphertext TEXT NOT NULL,
  pkce_verifier_nonce TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX shiphub_oauth_states_expiry_idx ON shiphub_oauth_states(expires_at, consumed_at);

CREATE TABLE shiphub_category_state (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'receive', 'ship')),
  last_count INTEGER,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_full_reconcile_at TEXT,
  next_reconcile_at TEXT,
  last_error_code TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, category)
);

CREATE TABLE shiphub_sync_leases (
  store_id TEXT PRIMARY KEY NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shiphub_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'receive', 'ship')),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('scheduled', 'manual', 'authorization')),
  batch_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'skipped', 'failed')),
  pages INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  detail_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE INDEX shiphub_sync_runs_store_started_idx ON shiphub_sync_runs(store_id, started_at DESC);

CREATE TABLE shiphub_orders (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hand', 'receive', 'ship')),
  upstream_order_id TEXT NOT NULL,
  display_label TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  order_status TEXT NOT NULL DEFAULT '',
  order_number TEXT,
  customer_phone TEXT,
  vehicle_info TEXT,
  scheduled_at TEXT,
  upstream_updated_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_seen_run_id TEXT REFERENCES shiphub_sync_runs(id),
  upstream_absent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, category, upstream_order_id)
);
CREATE INDEX shiphub_orders_current_idx
  ON shiphub_orders(store_id, category, updated_at DESC, upstream_order_id DESC)
  WHERE upstream_absent_at IS NULL;

CREATE TABLE shiphub_order_items (
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  upstream_order_id TEXT NOT NULL,
  upstream_item_id TEXT NOT NULL,
  product_label TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  vehicle_info TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  serial_number_masked TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, category, upstream_order_id, upstream_item_id),
  FOREIGN KEY (store_id, category, upstream_order_id)
    REFERENCES shiphub_orders(store_id, category, upstream_order_id) ON DELETE CASCADE
);

CREATE TABLE shiphub_order_actions (
  id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  upstream_order_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('pickup', 'receive', 'ship')),
  local_state TEXT NOT NULL CHECK (local_state IN ('completed', 'revoked')),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  acted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES users(id),
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id, category, upstream_order_id)
    REFERENCES shiphub_orders(store_id, category, upstream_order_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX shiphub_order_actions_idempotency_idx
  ON shiphub_order_actions(store_id, actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX shiphub_order_actions_current_idx
  ON shiphub_order_actions(store_id, category, upstream_order_id, acted_at DESC);
