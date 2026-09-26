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

-- The owner writes Emre's Tuesday shift, saves, previews and publishes the
-- week, naming Emre to hear of it (FB-6.1 .4: publishing is one function, so
-- the whole path runs, nothing is stood in for).
select tests.world('na');
select tests.person('na', 'emre', 'employee', array['K'], array['cook']);

create function pg_temp.publish_to_emre(n integer) returns jsonb
language plpgsql
as $$
declare
  owner_id uuid := tests.user('na:owner');
  w uuid := tests.id('na');
  session uuid;
  draft uuid;
  preview jsonb;
begin
  session := (public.acquire_schedule_edit_session_service(owner_id, w, tests.week(n), 'blank', null) -> 'session' ->> 'id')::uuid;
  perform tests.add_shift(owner_id, 'na', session, n,
    '{"person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}');
  draft := (public.save_schedule_edit_session_service(owner_id, w, session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'week ' || n, null, null) ->> 'id')::uuid;
  preview := public.preview_schedule_publication_service(owner_id, w, draft, array[tests.id('na:K')], null, true);
  return public.publish_schedule_draft_service(owner_id, w, draft, array[tests.id('na:K')], null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft), preview ->> 'fingerprint', '[]',
    array[tests.id('na:emre')]);
end;
$$;

create temp table atomic_publish_result (result jsonb);
insert into atomic_publish_result select pg_temp.publish_to_emre(1);
select is(
  (select (result->>'notification_enqueued_count')::integer from atomic_publish_result),
  1,
  'publish returns the durable audience size'
);
select is(
  (select count(*)::integer from public.notification_outbox
   where workspace_id = tests.id('na') and subject_type = 'schedule_week' and subject_id = tests.week(1)::text),
  1,
  'publish commits its outbox event before returning'
);

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

select throws_ok(
  $$select pg_temp.publish_to_emre(2)$$,
  'P0001',
  'forced outbox failure',
  'outbox failure aborts the publish statement'
);
select is(
  (select count(*)::integer from public.schedule_location_publications
   where workspace_id = tests.id('na') and week_start = tests.week(2)),
  0,
  'the domain write rolls back when atomic enqueue fails'
);

select * from finish();
rollback;
