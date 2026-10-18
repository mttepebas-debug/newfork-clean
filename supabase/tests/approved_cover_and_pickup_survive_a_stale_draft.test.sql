begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- BL-198 for a cover and a released shift (BL-229), approved in the same moment
-- as the publication they follow (BL-228). Ali's Tuesday and Wednesday shifts at
-- Kadikoy are published; Deniz covers Tuesday and picks up the Wednesday Ali
-- released (TAKAS-RELEASE: only a release reaches the pool), Ayse approves both.
-- A draft that missed them is refused.
-- Nothing moves the publication back in time: one transaction has one now(),
-- the closest a test gets to an approval that waited for the workspace lock
-- behind a publish.

select tests.world('cp');
select tests.person('cp', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('cp', 'ali', 'employee', array['K'], array['cook']);
select tests.person('cp', 'deniz', 'employee', array['K'], array['cook']);
select tests.remember('cp:draft', tests.publish_week('cp', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-wed", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));

create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('cp:' || person), tests.id('cp'), command, gen_random_uuid())
$$;
create function pg_temp.approve(label text) returns jsonb language sql as $$
  select pg_temp.command('ayse', jsonb_build_object('action', 'approve', 'case_id', tests.id('cp:case:' || label),
    'application_id', tests.id('cp:application:' || label),
    'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('cp:case:' || label)),
    'fingerprint', public.shift_exchange_preview(tests.user('cp:ayse'), tests.id('cp'), tests.id('cp:case:' || label),
      tests.id('cp:application:' || label)) ->> 'fingerprint'))
$$;
create function pg_temp.undone() returns jsonb language sql as $$
  select coalesce(jsonb_agg(f order by f ->> 'scheduled_date'), '[]') from jsonb_array_elements(
    public.preview_schedule_publication_service(tests.user('cp:ayse'), tests.id('cp'), tests.id('cp:draft'),
      array[tests.id('cp:K')], null, true) -> 'findings') f
  where f ->> 'code' = 'shift_exchange_undone'
$$;

-- Deniz covers Tuesday; Ayse approves.
select tests.cover_case('cp', 'ali-tue', 'ali', 'deniz');
select is(pg_temp.approve('ali-tue') ->> 'status', 'completed', 'Ayse approves Deniz covering Ali''s Tuesday');

-- Ali releases Wednesday, Deniz picks it up; Ayse approves.
select tests.cover_case('cp', 'ali-wed', 'ali', 'deniz');
select is(pg_temp.approve('ali-wed') ->> 'status', 'completed', 'Ayse approves Deniz picking up Ali''s released Wednesday');

-- The first draft saved again from a screen that missed both.
update public.schedule_draft_shifts set employee_id = tests.id('cp:ali')
where draft_id = tests.id('cp:draft');

select is(jsonb_array_length(pg_temp.undone()), 2, 'both approved changes are findings, though approved in the publish''s own moment');
select is(pg_temp.undone() -> 0 ->> 'exchange_kind', 'cover', 'Tuesday is the cover');
select is(pg_temp.undone() -> 0 ->> 'message',
  'This shift was handed over from Ali Person to Deniz Person after the schedule was last published, and this draft does not have it. Publishing would undo it.',
  'and says who handed it over to whom');
select is(pg_temp.undone() -> 1 ->> 'exchange_kind', 'cover', 'Wednesday is the released shift');
select is(pg_temp.undone() -> 1 ->> 'message',
  'This shift was handed over from Ali Person to Deniz Person after the schedule was last published, and this draft does not have it. Publishing would undo it.',
  'and says who handed it over to whom');

select * from finish();
rollback;
