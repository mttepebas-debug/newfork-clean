begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  has_function_privilege(
    'service_role',
    'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,uuid[])',
    'execute'
  ),
  'service role can execute atomic schedule publish and enqueue'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,uuid[])',
    'execute'
  ),
  'authenticated clients cannot execute atomic schedule publish and enqueue'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'e1700000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'atomic-publish@example.test', '', '{}', '{}', now(), now()
);
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
)
values (
  'e1710000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'e1700000-0000-4000-8000-000000000001',
  'employee', 'active', true
);
update public.employee_profiles
set user_id = 'e1700000-0000-4000-8000-000000000001'
where id = '15000000-0000-4000-8000-000000000001';

insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, status,
  published_by, published_at
)
values (
  'e1720000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  '2040-01-02', 1, 'current',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', now()
);
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id
)
values (
  'e1730000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  'e1720000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '2040-01-02', '09:00', '17:00', '',
  'e1740000-0000-4000-8000-000000000001'
);

create or replace function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  target_department_ids uuid[],
  include_no_department boolean,
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'status', 'published',
    'workspace_id', target_workspace_id,
    'week_start', '2040-01-02',
    'draft_id', target_draft_id,
    'draft_revision', expected_draft_revision,
    'location_ids', to_jsonb(target_location_ids),
    'publication_ids', jsonb_build_array('e1720000-0000-4000-8000-000000000001'),
    'published_shift_count', 1,
    'published_at', now()
  );
end;
$$;

create temp table atomic_publish_result (result jsonb);
insert into atomic_publish_result
select public.publish_schedule_draft_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'e1750000-0000-4000-8000-000000000001',
  array['11000000-0000-4000-8000-000000000001'::uuid],
  null, true, 1, repeat('a', 64), '[]',
  array['15000000-0000-4000-8000-000000000001'::uuid]
);
select is(
  (select (result->>'notification_enqueued_count')::integer from atomic_publish_result),
  1,
  'publish returns the durable audience size'
);
select is(
  (select count(*)::integer from public.notification_outbox where subject_id = '2040-01-02'),
  1,
  'publish commits its outbox event before returning'
);

delete from public.notification_outbox where subject_id = '2040-01-02';
create function pg_temp.reject_notification_outbox()
returns trigger
language plpgsql
as $$
begin
  raise exception 'forced outbox failure' using errcode = 'P0001';
end;
$$;
create trigger reject_notification_outbox
before insert on public.notification_outbox
for each row execute function pg_temp.reject_notification_outbox();

create or replace function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  target_department_ids uuid[],
  include_no_department boolean,
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_publication_events (
    id, workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint
  ) values (
    'e1760000-0000-4000-8000-000000000001', target_workspace_id,
    '2040-01-02', 'published', actor_user_id, target_location_ids,
    array['e1720000-0000-4000-8000-000000000001'::uuid], expected_fingerprint
  );
  return jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', '2040-01-02', 'draft_id', target_draft_id,
    'draft_revision', expected_draft_revision,
    'location_ids', to_jsonb(target_location_ids),
    'publication_ids', jsonb_build_array('e1720000-0000-4000-8000-000000000001'),
    'published_shift_count', 1, 'published_at', now()
  );
end;
$$;

select throws_ok(
  $$select public.publish_schedule_draft_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'e1750000-0000-4000-8000-000000000002',
    array['11000000-0000-4000-8000-000000000001'::uuid],
    null, true, 1, repeat('b', 64), '[]',
    array['15000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'P0001',
  'forced outbox failure',
  'outbox failure aborts the publish statement'
);
select is(
  (select count(*)::integer from public.schedule_publication_events where id = 'e1760000-0000-4000-8000-000000000001'),
  0,
  'the domain write rolls back when atomic enqueue fails'
);

select * from finish();
rollback;
