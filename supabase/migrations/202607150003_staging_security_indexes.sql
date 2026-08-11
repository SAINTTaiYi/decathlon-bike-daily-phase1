begin;

alter table public.bike_ops_schema_migrations enable row level security;
revoke all on table public.bike_ops_schema_migrations from public, anon, authenticated;

create index if not exists attachments_store_id_idx on bike_ops.attachments(store_id);
create index if not exists attachments_uploaded_by_idx on bike_ops.attachments(uploaded_by);
create index if not exists audit_events_actor_user_id_idx on bike_ops.audit_events(actor_user_id);
create index if not exists daily_closings_closed_by_idx on bike_ops.daily_closings(closed_by);
create index if not exists daily_closings_sales_saved_by_idx on bike_ops.daily_closings(sales_saved_by);
create index if not exists handover_details_completed_by_idx on bike_ops.handover_details(completed_by);
create index if not exists idempotency_requests_user_id_idx on bike_ops.idempotency_requests(user_id);
create index if not exists import_jobs_imported_by_idx on bike_ops.import_jobs(imported_by);
create index if not exists pickup_details_picked_up_by_idx on bike_ops.pickup_details(picked_up_by);
create index if not exists pickup_details_repair_work_item_id_idx on bike_ops.pickup_details(repair_work_item_id);
create index if not exists store_members_user_id_idx on bike_ops.store_members(user_id);
create index if not exists work_items_created_by_idx on bike_ops.work_items(created_by);
create index if not exists work_items_deleted_by_idx on bike_ops.work_items(deleted_by);
create index if not exists work_items_updated_by_idx on bike_ops.work_items(updated_by);

commit;
