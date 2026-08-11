begin;

-- Flat store self-registration: remove the legacy directory hierarchy from the
-- Supabase-compatible schema. Business tables already reference stores directly.
drop index if exists bike_ops.stores_city_active_idx;
alter table bike_ops.stores drop column if exists city_id;
drop table if exists bike_ops.cities;
drop table if exists bike_ops.subregions;
drop table if exists bike_ops.regions;
alter table bike_ops.stores add column if not exists self_registration_pending boolean not null default false;

commit;
