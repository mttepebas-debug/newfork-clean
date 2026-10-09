begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('53000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','publish-manager@example.test','','{}','{}',now(),now());
insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by)
values ('85000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
current_date-(extract(isodow from current_date)::integer-1),'Publication test draft',1,
'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, revision)
select source_shift_id, workspace_id, '85000000-0000-4000-8000-000000000001', location_id,
employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, 1
from public.schedule_published_shifts;
select 'published rows', count(*) from public.schedule_published_shifts where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';
select 'week', current_date-(extract(isodow from current_date)::integer-1), (select min(week_start) from public.schedule_location_publications where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd');
create temp table t as select
 public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid]) hard,
 public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid]) soft;
select 'hard', hard->>'status', jsonb_pretty(hard->'findings') from t;
select 'soft', soft->>'status', jsonb_pretty(soft->'findings') from t;
select 'soft2 same fp', (public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid])->>'fingerprint')=(select soft->>'fingerprint' from t);
select 'publish loc1', public.publish_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid],1,(select hard->>'fingerprint' from t),'[]')->>'status';
create temp table t2 as select public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid]) soft;
select 'soft after loc1 publish same fp', (select soft->>'fingerprint' from t2)=(select soft->>'fingerprint' from t);
select key, (select soft->key from t)=(select soft->key from t2) from jsonb_object_keys((select soft from t)) key;
select 'old', jsonb_pretty((select soft->'locations' from t)); select 'new', jsonb_pretty((select soft->'locations' from t2));
rollback;
