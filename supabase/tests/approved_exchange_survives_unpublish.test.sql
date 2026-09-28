begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- BL-230 (user, K13 a): an approved shift change is never undone by publishing
-- a draft, also after the week was taken down. Ali's Tuesday and Deniz's
-- Wednesday at Kadikoy are published; they swap and Ayse approves; then Ayse
-- takes the week down. A new draft that gives Tuesday back to Ali is a
-- blocker and does not publish; a draft that carries the swap publishes.

-- The SQLSTATE a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate;
  return state;
end;
$$;

select tests.world('su');
select tests.person('su', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('su', 'ali', 'employee', array['K'], array['cook']);
select tests.person('su', 'deniz', 'employee', array['K'], array['cook']);
select tests.publish_week('su', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "deniz-wed", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
-- ponytail: one transaction has one now(); the publication moves an hour back
-- so the swap below is approved after it, as it would be for real.
update public.schedule_location_publications set published_at = published_at - interval '1 hour'
where workspace_id = tests.id('su');

create temporary table su (key text primary key, value jsonb);
create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('su:' || person), tests.id('su'), command, gen_random_uuid())
$$;
create function pg_temp.case_id() returns uuid language sql as $$
  select (value ->> 'case_id')::uuid from su where key = 'created'
$$;
create function pg_temp.application_id() returns uuid language sql as $$
  select a.id from public.shift_exchange_applications a where a.case_id = pg_temp.case_id()
$$;
create function pg_temp.revision() returns integer language sql as $$
  select c.revision from public.shift_exchange_cases c where c.id = pg_temp.case_id()
$$;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('su:ayse'), tests.id('su'), draft, array[tests.id('su:K')], null, true)
$$;
create function pg_temp.publish(draft uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.publish_schedule_draft_service(%1$L, %2$L, %3$L, %4$L, null, true, %5$s,
       public.preview_schedule_publication_service(%1$L, %2$L, %3$L, %4$L, null, true) ->> ''fingerprint'', ''[]''::jsonb)',
    tests.user('su:ayse'), tests.id('su'), draft, array[tests.id('su:K')],
    (select d.revision from public.schedule_drafts d where d.id = draft)))
$$;
create function pg_temp.undone_dates(preview jsonb) returns date[] language sql as $$
  select coalesce(array_agg((f ->> 'scheduled_date')::date order by f ->> 'scheduled_date'), '{}')
  from jsonb_array_elements(preview -> 'findings') f where f ->> 'code' = 'shift_exchange_undone'
$$;
-- A new draft of week 1 at Kadikoy, written by Ayse.
create function pg_temp.new_draft(shifts jsonb) returns uuid language plpgsql as $$
declare
  session uuid := (public.acquire_schedule_edit_session_service(
    tests.user('su:ayse'), tests.id('su'), tests.week(1), 'blank', null, array[tests.id('su:K')]) -> 'session' ->> 'id')::uuid;
  shift jsonb;
begin
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.add_shift(tests.user('su:ayse'), 'su', session, 1, shift);
  end loop;
  return (public.save_schedule_edit_session_service(
    tests.user('su:ayse'), tests.id('su'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'su ' || gen_random_uuid(), null, null
  ) ->> 'id')::uuid;
end;
$$;

-- Ali and Deniz swap; Ayse approves.
insert into su values ('created', pg_temp.command('ali', jsonb_build_object(
  'action', 'create', 'kind', 'swap',
  'shift_id', tests.id('su:shift:ali-tue'), 'requested_shift_id', tests.id('su:shift:deniz-wed'))));
select tests.settle();
select pg_temp.command('deniz', jsonb_build_object('action', 'accept', 'case_id', pg_temp.case_id(),
  'application_id', pg_temp.application_id(), 'expected_revision', pg_temp.revision()));
select tests.settle();
select pg_temp.command('ayse', jsonb_build_object('action', 'approve', 'case_id', pg_temp.case_id(),
  'application_id', pg_temp.application_id(), 'expected_revision', pg_temp.revision(),
  'fingerprint', public.shift_exchange_preview(tests.user('su:ayse'), tests.id('su'), pg_temp.case_id(), pg_temp.application_id()) ->> 'fingerprint'));
select tests.settle();
select is((select status::text from public.shift_exchange_cases where id = pg_temp.case_id()), 'completed',
  'the swap is approved');

-- Ayse takes the week down.
select public.unpublish_schedule_service(tests.user('su:ayse'), tests.id('su'), tests.week(1), array[tests.id('su:K')],
  public.preview_schedule_unpublication_service(tests.user('su:ayse'), tests.id('su'), tests.week(1), array[tests.id('su:K')]) ->> 'fingerprint');
select is(
  (select status::text from public.schedule_location_publications
   where location_id = tests.id('su:K') and week_start = tests.week(1) order by version_number desc limit 1),
  'unpublished',
  'the week is down'
);

-- A new draft with the week as it was before the swap.
select tests.remember('su:draft:stale', pg_temp.new_draft('[
  {"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
select is(pg_temp.undone_dates(pg_temp.preview(tests.id('su:draft:stale'))),
  array[tests.week(1) + 1, tests.week(1) + 2],
  'the pre-flight check says the draft undoes the approved swap, both days');
select is(pg_temp.publish(tests.id('su:draft:stale')), '23514',
  'and the draft does not publish');

-- A draft that carries the swap publishes.
select tests.remember('su:draft:swapped', pg_temp.new_draft('[
  {"person": "deniz", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
select is(pg_temp.undone_dates(pg_temp.preview(tests.id('su:draft:swapped'))), '{}'::date[],
  'a draft that carries the swap has no swap blocker');
select is(pg_temp.publish(tests.id('su:draft:swapped')), 'allowed',
  'and it publishes');

select * from finish();
rollback;
