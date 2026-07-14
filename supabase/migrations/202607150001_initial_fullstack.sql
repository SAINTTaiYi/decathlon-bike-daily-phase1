begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists bike_ops;
revoke all on schema bike_ops from public;
revoke all on schema bike_ops from anon, authenticated;

create table bike_ops.stores (
  id uuid primary key default extensions.gen_random_uuid(),
  code varchar(32) not null unique,
  name varchar(120) not null,
  timezone varchar(64) not null default 'Asia/Shanghai',
  status varchar(16) not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bike_ops.users (
  id uuid primary key default extensions.gen_random_uuid(),
  username_key varchar(64) not null unique,
  display_name varchar(24) not null,
  password_hash text not null,
  status varchar(16) not null default 'active' check (status in ('active', 'disabled')),
  must_change_password boolean not null default false,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bike_ops.store_members (
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  user_id uuid not null references bike_ops.users(id) on delete cascade,
  role varchar(16) not null check (role in ('operator', 'manager', 'admin')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table bike_ops.auth_sessions (
  token_hash char(64) primary key,
  csrf_hash char(64) not null,
  user_id uuid not null references bike_ops.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip_hash char(64),
  user_agent varchar(500)
);
create index auth_sessions_user_active_idx on bike_ops.auth_sessions(user_id, expires_at) where revoked_at is null;

create table bike_ops.daily_closings (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  business_date date not null,
  sales_vehicles integer not null default 0 check (sales_vehicles >= 0),
  safety_checks integer not null default 0 check (safety_checks >= 0),
  safety_model varchar(120) not null default '',
  valid_reviews integer not null default 0 check (valid_reviews >= 0),
  used_sold integer not null default 0 check (used_sold >= 0),
  used_received integer not null default 0 check (used_received >= 0),
  sales_saved_at timestamptz,
  sales_saved_by uuid references bike_ops.users(id),
  closing_status varchar(16) not null default 'open' check (closing_status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references bike_ops.users(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, business_date)
);

create table bike_ops.work_items (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  kind varchar(24) not null check (kind in ('pickup', 'handover', 'repair', 'resale')),
  title varchar(120) not null,
  detail varchar(500) not null default '',
  meta varchar(240) not null default '',
  status varchar(80) not null,
  lifecycle varchar(24) not null default 'active' check (lifecycle in ('active', 'completed', 'picked-up', 'sold', 'deleted')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references bike_ops.users(id),
  updated_by uuid not null references bike_ops.users(id),
  deleted_by uuid references bike_ops.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index work_items_store_kind_active_idx on bike_ops.work_items(store_id, kind, updated_at desc) where deleted_at is null;

create table bike_ops.repair_details (
  work_item_id uuid primary key references bike_ops.work_items(id) on delete cascade,
  contact_type varchar(16) not null check (contact_type in ('phone', 'member')),
  contact_ciphertext text not null,
  contact_fingerprint char(64),
  repair_type varchar(24) not null check (repair_type in ('质保', '付费', '免费', '门店产品维修')),
  repair_project varchar(500) not null,
  pickup_date date,
  repair_status varchar(32) not null check (repair_status in ('维修中', '等待配件', '已开付款单', '已开质保单', '已完成')),
  repair_completed_at timestamptz,
  completed_on date,
  completed_at timestamptz,
  constraint repair_pickup_date_check check (
    (repair_type = '门店产品维修' and pickup_date is null)
    or (repair_type <> '门店产品维修' and pickup_date is not null)
  )
);

create table bike_ops.pickup_details (
  work_item_id uuid primary key references bike_ops.work_items(id) on delete cascade,
  pickup_source varchar(32) not null check (pickup_source in ('self-pickup', 'repair', 'customer-storage')),
  self_pickup_platform varchar(24) check (self_pickup_platform in ('tmall', 'jd', 'mini-program')),
  notification_status varchar(16) not null default 'pending' check (notification_status in ('pending', 'notified')),
  repair_work_item_id uuid references bike_ops.work_items(id),
  picked_up_on date,
  picked_up_at timestamptz,
  picked_up_by uuid references bike_ops.users(id),
  constraint self_pickup_platform_check check (
    (pickup_source = 'self-pickup' and self_pickup_platform is not null)
    or (pickup_source <> 'self-pickup' and self_pickup_platform is null)
  )
);

create table bike_ops.resale_details (
  work_item_id uuid primary key references bike_ops.work_items(id) on delete cascade,
  resale_stage varchar(16) not null default 'pending' check (resale_stage in ('pending', 'listed', 'sold')),
  listed_at timestamptz,
  sold_at timestamptz
);

create table bike_ops.handover_details (
  work_item_id uuid primary key references bike_ops.work_items(id) on delete cascade,
  completed_on date,
  completed_at timestamptz,
  completed_by uuid references bike_ops.users(id)
);

create table bike_ops.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  actor_user_id uuid references bike_ops.users(id),
  actor_name_snapshot varchar(24) not null,
  action varchar(64) not null,
  entity_type varchar(32) not null,
  entity_id uuid,
  entity_revision integer,
  business_date date not null,
  summary varchar(500) not null,
  before_state jsonb,
  after_state jsonb,
  reversible boolean not null default false,
  reverted_event_id uuid references bike_ops.audit_events(id),
  request_id uuid not null,
  created_at timestamptz not null default now()
);
create index audit_events_store_created_idx on bike_ops.audit_events(store_id, created_at desc);
create index audit_events_entity_idx on bike_ops.audit_events(entity_type, entity_id, created_at desc);
create unique index audit_event_single_revert_idx on bike_ops.audit_events(reverted_event_id) where reverted_event_id is not null;

create table bike_ops.attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  work_item_id uuid not null references bike_ops.work_items(id) on delete cascade,
  object_key varchar(500) not null unique,
  original_name varchar(160) not null,
  mime_type varchar(64) not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 char(64) not null,
  width integer,
  height integer,
  status varchar(16) not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  uploaded_by uuid not null references bike_ops.users(id),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz
);
create index attachments_work_item_idx on bike_ops.attachments(work_item_id, created_at) where status <> 'deleted';

create table bike_ops.idempotency_requests (
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  user_id uuid not null references bike_ops.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash char(64) not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (store_id, user_id, idempotency_key)
);

create table bike_ops.import_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references bike_ops.stores(id) on delete cascade,
  imported_by uuid not null references bike_ops.users(id),
  source_version integer not null,
  source_fingerprint char(64) not null,
  status varchar(16) not null check (status in ('planned', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, source_fingerprint)
);

create table bike_ops.app_releases (
  id uuid primary key default extensions.gen_random_uuid(),
  app_version varchar(24) not null,
  web_version varchar(24) not null,
  api_version varchar(24) not null,
  schema_version varchar(80) not null,
  git_sha varchar(64) not null,
  environment varchar(24) not null,
  deployed_at timestamptz not null default now(),
  deployed_by varchar(120) not null
);

commit;
