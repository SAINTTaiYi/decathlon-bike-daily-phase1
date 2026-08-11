-- Governed store directory, self-service registration, platform approvals, and target-store transfers.
-- Forward-only compatibility migration for the legacy PostgreSQL/Supabase stack.

create table bike_ops.regions (
  id uuid primary key default extensions.gen_random_uuid(),
  name varchar(120) not null,
  normalized_name varchar(120) not null unique,
  status varchar(16) not null default 'active' check (status in ('active', 'disabled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bike_ops.cities (
  id uuid primary key default extensions.gen_random_uuid(),
  region_id uuid not null references bike_ops.regions(id) on delete restrict,
  name varchar(120) not null,
  normalized_name varchar(120) not null,
  status varchar(16) not null default 'active' check (status in ('active', 'disabled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, normalized_name)
);

alter table bike_ops.stores add column city_id uuid references bike_ops.cities(id) on delete restrict;
alter table bike_ops.users add column email_key varchar(320);
alter table bike_ops.users add column is_platform_admin boolean not null default false;

-- A user can transfer back to a former store. Replace the old composite key so inactive
-- membership history does not block a later active membership at that same store.
alter table bike_ops.store_members add column id uuid default extensions.gen_random_uuid();
alter table bike_ops.store_members add column status varchar(16) not null default 'active' check (status in ('active', 'inactive'));
alter table bike_ops.store_members add column effective_from timestamptz;
alter table bike_ops.store_members add column effective_to timestamptz;
alter table bike_ops.store_members add column ended_by uuid references bike_ops.users(id);
alter table bike_ops.store_members add column end_reason varchar(500);
update bike_ops.store_members set effective_from = created_at where effective_from is null;
-- The former composite key allowed multiple current stores. Keep the legacy login's
-- earliest membership active and retain any additional memberships as history before
-- enforcing the new single-current-store invariant.
with ranked as (
  select ctid, row_number() over (partition by user_id order by created_at asc, store_id asc) as membership_rank
  from bike_ops.store_members
)
update bike_ops.store_members member
set status = case when ranked.membership_rank = 1 then 'active' else 'inactive' end,
    effective_to = case when ranked.membership_rank = 1 then null else member.created_at end,
    end_reason = case when ranked.membership_rank = 1 then null else '迁移：统一单一当前门店关系' end
from ranked
where member.ctid = ranked.ctid;
alter table bike_ops.store_members alter column id set not null;
alter table bike_ops.store_members alter column effective_from set not null;
alter table bike_ops.store_members drop constraint store_members_pkey;
alter table bike_ops.store_members add primary key (id);

create unique index users_email_key_unique_idx on bike_ops.users(email_key) where email_key is not null;
create unique index users_one_platform_admin_idx on bike_ops.users(is_platform_admin) where is_platform_admin;
create unique index store_members_one_active_user_idx on bike_ops.store_members(user_id) where status = 'active';
create index stores_city_active_idx on bike_ops.stores(city_id, status, code);
create index store_members_active_store_role_idx on bike_ops.store_members(store_id, role, user_id) where status = 'active';

create table bike_ops.registration_challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  email_key varchar(320) not null,
  username_key varchar(64) not null,
  display_name varchar(24) not null,
  store_id uuid not null references bike_ops.stores(id) on delete restrict,
  otp_hash char(64) not null,
  completion_token_hash char(64),
  client_hash char(64),
  status varchar(16) not null check (status in ('pending', 'verified', 'completed', 'expired')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  resend_count integer not null default 0 check (resend_count >= 0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index registration_challenges_email_created_idx on bike_ops.registration_challenges(email_key, created_at desc);
create index registration_challenges_client_created_idx on bike_ops.registration_challenges(client_hash, created_at desc) where client_hash is not null;

create table bike_ops.role_change_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references bike_ops.users(id) on delete restrict,
  store_id uuid not null references bike_ops.stores(id) on delete restrict,
  requested_by uuid not null references bike_ops.users(id) on delete restrict,
  from_role varchar(16) not null check (from_role in ('operator', 'manager', 'admin')),
  target_role varchar(16) not null check (target_role in ('manager', 'admin')),
  reason varchar(500) not null,
  status varchar(16) not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_reason varchar(500),
  decided_by uuid references bike_ops.users(id) on delete restrict,
  expires_at timestamptz not null,
  decided_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index role_change_requests_one_pending_idx on bike_ops.role_change_requests(user_id, store_id) where status = 'pending';
create index role_change_requests_status_created_idx on bike_ops.role_change_requests(status, created_at desc);

create table bike_ops.store_transfer_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references bike_ops.users(id) on delete restrict,
  source_store_id uuid not null references bike_ops.stores(id) on delete restrict,
  target_store_id uuid not null references bike_ops.stores(id) on delete restrict,
  reason varchar(500) not null,
  status varchar(16) not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_reason varchar(500),
  decided_by uuid references bike_ops.users(id) on delete restrict,
  expires_at timestamptz not null,
  decided_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_store_id <> target_store_id)
);
create unique index store_transfer_requests_one_pending_idx on bike_ops.store_transfer_requests(user_id) where status = 'pending';
create index store_transfer_requests_target_status_idx on bike_ops.store_transfer_requests(target_store_id, status, created_at desc);

insert into bike_ops.regions (id, name, normalized_name, status, sort_order)
values ('30000000-0000-4000-8000-000000000001', '南区', '南区', 'active', 10)
on conflict (id) do nothing;

insert into bike_ops.cities (id, region_id, name, normalized_name, status, sort_order)
values ('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '广西', '广西', 'active', 10)
on conflict (id) do nothing;

-- Existing deployments may already have one of these globally unique codes. Keep its
-- stable id and history, and attach it to the governed city rather than failing the migration.
insert into bike_ops.stores (id, code, name, timezone, status, city_id)
values
  ('30000000-0000-4000-8000-000000001299', '1299', '五象店', 'Asia/Shanghai', 'active', '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000001670', '1670', '民族东店', 'Asia/Shanghai', 'active', '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000994', '994', '穿山店', 'Asia/Shanghai', 'active', '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000001249', '1249', '河东店', 'Asia/Shanghai', 'active', '30000000-0000-4000-8000-000000000002')
on conflict (code) do update set city_id = excluded.city_id, updated_at = now();
