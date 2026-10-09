begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- BL-208: a pooled connection that once published keeps
-- newfork.schedule_publish_scope as '' (not NULL) after the transaction that
-- set it. The availability guard on published shifts cast that '' to jsonb
-- inside an EXISTS the planner evaluates early, so the approval that applies
-- a shift exchange failed with 22P02 at random ("Shift changes are
-- unavailable"). Each approval below applies a cover, which reassigns a
-- published shift and runs the guard.

select tests.world('gs');
select tests.person('gs', 'emre', 'employee', array['K'], array['cook']);
select tests.person('gs', 'ali', 'employee', array['K'], array['cook']);
select tests.publish_week('gs', 1, '[
  {"label": "n", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "e", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "f", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "x", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('gs', label, 'emre', 'ali') from unnest(array['n', 'e', 'f', 'x']) label;

create function pg_temp.approve(label text) returns text
language plpgsql
as $$
declare
  owner_id uuid := tests.user('gs:owner');
  case_id uuid := tests.id('gs:case:' || label);
  application_id uuid := tests.id('gs:application:' || label);
begin
  perform public.shift_exchanges_command_service(owner_id, tests.id('gs'), jsonb_build_object(
    'action', 'approve', 'case_id', case_id, 'application_id', application_id,
    'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = case_id),
    'fingerprint', public.shift_exchange_preview(owner_id, tests.id('gs'), case_id, application_id) ->> 'fingerprint'),
    gen_random_uuid());
  return 'approved';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
create function pg_temp.works_it(label text) returns boolean
language sql
as $$
  select exists (select 1 from public.schedule_published_shifts s
    where s.id = tests.id('gs:shift:' || label) and s.employee_id = tests.id('gs:ali'))
$$;

-- Never set on this connection: NULL.
select is(pg_temp.approve('n'), 'approved', 'with no publish scope set, the approval applies the cover');
select ok(pg_temp.works_it('n'), 'and Ali works the shift');

-- Left empty by an earlier publish on the same connection.
select set_config('newfork.schedule_publish_scope', '', false);
select is(pg_temp.approve('e'), 'approved', 'with the publish scope left empty by an earlier publish, the approval applies the cover');
select ok(pg_temp.works_it('e'), 'and Ali works the shift');

-- Set, for another workspace's publish: no match, no effect.
select set_config('newfork.schedule_publish_scope',
  jsonb_build_object('workspace_id', gen_random_uuid(), 'draft_id', gen_random_uuid())::text, false);
select is(pg_temp.approve('f'), 'approved', 'with a publish scope of another publish, the approval applies the cover');
select ok(pg_temp.works_it('f'), 'and Ali works the shift');

-- The exchange scope left empty the same way.
select set_config('newfork.shift_exchange_scope', '', false);
select is(pg_temp.approve('x'), 'approved', 'with the exchange scope left empty, the approval applies the cover');
select ok(pg_temp.works_it('x'), 'and Ali works the shift');

select * from finish();
rollback;
