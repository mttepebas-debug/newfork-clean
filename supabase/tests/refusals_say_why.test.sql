begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- G11: every no carries its authz.* reason, so the API answers it 403/404 with
-- the key and the web's isNoAccess reads it.
--   BL-145: Ayse saves an emergency contact on Ali's record.
--   BL-356 (3): a scheduled export runs as the person who set it up; once they
--     are suspended or removed the preview is refused with an authz reason, which
--     is what makes the cron switch the export off and say why.
--   BL-156: a publish preview names Kadikoy after Kadikoy was closed (archived).

select tests.world('rw');
select tests.person('rw', 'ayse', 'employee', array['K'], array['cook']);
select tests.person('rw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('rw', 'deniz', 'manager', array['K'], array['cook']);
select tests.person('rw', 'mina', 'manager', array['K'], array['cook'], 'suspended');
select tests.person('rw', 'omer', 'manager', array['K'], array['cook'], 'removed');

-- The state and the hint of whatever the statement raised.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  state text;
  why text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ' ' || coalesce(nullif(why, ''), '(no hint)');
end;
$$;

create function pg_temp.export_as(person text) returns text language sql as $$
  select format('select public.preview_schedule_export_service(%L, %L, %L, ''published'', null, %L)',
    tests.user('rw:' || person), tests.id('rw'), tests.week(0), array[tests.id('rw:K')])
$$;

select is(
  pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, ''Aylin'', ''Mother'', ''5551234567'')',
    tests.user('rw:ayse'), tests.id('rw'), tests.id('rw:ali'))),
  '42501 authz.out_of_scope',
  'somebody else''s record is out of scope, and the refusal says so');

select is(
  pg_temp.refusal(pg_temp.export_as('deniz')),
  'no refusal',
  'a manager at Kadikoy may still export Kadikoy');

select ok(
  pg_temp.refusal(pg_temp.export_as('mina')) like '42501 authz.%',
  'a suspended creator''s export is refused with an authz reason');

select ok(
  pg_temp.refusal(pg_temp.export_as('omer')) like '42501 authz.%',
  'a removed creator''s export is refused with an authz reason');

select tests.publish_week('rw', 1, '[{"label": "open", "person": "ayse", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}]'::jsonb);
update public.locations set archived_at = now() where id = tests.id('rw:K');

select is(
  pg_temp.refusal(format(
    'select public.preview_schedule_publication_service(%L, %L, %L, %L, null, true)',
    tests.user('rw:owner'), tests.id('rw'),
    (select d.id from public.schedule_drafts d where d.workspace_id = tests.id('rw') and d.archived_at is null order by d.created_at desc limit 1),
    array[tests.id('rw:K')])),
  '42501 authz.out_of_scope',
  'a closed location is out of scope for a publish, and the refusal says so');

select * from finish();
rollback;
