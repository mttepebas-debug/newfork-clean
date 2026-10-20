begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- DAVET-ERISIM part 2 (Mert, 2026-10-20). Remote and Exclude from schedule never lift the rule that somebody
-- works at a location (one primary) and a job (one primary); the owner's own record stays outside it. A new
-- workspace's setup files the founder with the Owner job and the first location as primaries, off the Schedule.

select tests.world('ar');
select tests.person('ar', 'ali', 'employee', array['K'], array['cook']);
-- Rana is waiting on her invitation, filed Remote with no location: a record saved before the rule.
select tests.person('ar', 'rana', 'employee', '{}', array['cook'], 'pending');

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics state = returned_sqlstate, key = pg_exception_hint;
  return state || ' ' || coalesce(nullif(key, ''), '(no hint)');
end;
$$;

-- Ali saved as he is but for the assignments and the two switches.
create function pg_temp.save_ali(locs uuid[], primary_loc uuid, jobs uuid[], primary_job uuid, remote boolean, excluded boolean)
returns text language sql as $$
  select format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, null, %L, %L::uuid[], %L, %L::uuid[], %L, %L, %L, %L)',
    tests.user('ar:owner'), tests.id('ar'), tests.id('ar:ali'), e.first_name, e.middle_name, e.last_name,
    e.preferred_name, e.invitation_email, e.internal_note, locs, primary_loc, jobs, primary_job, remote, excluded,
    e.revision)
  from public.employee_profiles e where e.id = tests.id('ar:ali')
$$;

select is(pg_temp.refusal(pg_temp.save_ali('{}', null, array[tests.id('ar:job:cook')], tests.id('ar:job:cook'), true, false)),
  '22023 employee.location_required', 'Remote no longer saves somebody with no location');
select is(pg_temp.refusal(pg_temp.save_ali('{}', null, array[tests.id('ar:job:cook')], tests.id('ar:job:cook'), false, true)),
  '22023 employee.location_required', 'nor does Exclude from schedule');
select is(pg_temp.refusal(pg_temp.save_ali(array[tests.id('ar:K')], tests.id('ar:K'), '{}', null, true, true)),
  '22023 employee.job_required', 'Remote and excluded, somebody still needs a job');
select is(pg_temp.refusal(pg_temp.save_ali(array[tests.id('ar:K')], tests.id('ar:K'), array[tests.id('ar:job:cook')], null, true, true)),
  '22023 employee.primary_job_required', 'and one of their jobs primary');
select is(pg_temp.refusal(pg_temp.save_ali(array[tests.id('ar:K')], tests.id('ar:K'), array[tests.id('ar:job:cook')], tests.id('ar:job:cook'), true, true)),
  'no refusal', 'Remote and excluded with a location and a job saves');

-- A record saved before the rule, Remote with no location, is not invited again until it gets one.
select is((select p.is_remote from public.employee_profiles p where p.id = tests.id('ar:rana')), true, 'Rana is Remote');
select is(pg_temp.refusal(format(
    'select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, null, ''{}''::uuid[], %L, now() + interval ''7 days'')',
    tests.user('ar:owner'), tests.id('ar'), tests.id('ar:rana'),
    (select u.email from auth.users u where u.id = tests.user('ar:rana')),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ar') and r.system_key = 'employee'),
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'))),
  '22023 (no hint)', 'a Remote record with no location is not invited');

-- Setup. The test world's owner unticks Exclude from schedule afterwards (builder), so a workspace of its own.
create temporary table fresh as select tests.new_user('fresh:owner', 'Fay Founder') as owner_id, null::uuid as workspace;
update fresh set workspace = public.create_owner_workspace_service(owner_id, 'Fresh Grill');
select public.update_owner_onboarding_service(owner_id, workspace, 'Fresh Grill', 2::smallint, false,
  (select o.revision from public.workspace_onboarding o where o.workspace_id = fresh.workspace), 'Fay', null, 'Founder')
from fresh;
select tests.as_browser(owner_id, format(
  $sql$insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, 'Mission', 'MSN', '1 Valencia St', 'San Francisco', 'CA', '94110', 'America/Los_Angeles')$sql$, workspace))
from fresh;
select public.create_department_with_jobs_service(owner_id, workspace,
  '{"name": "Kitchen", "color": "#3C7A68"}'::jsonb, '[{"name": "Cook", "color": "#D39A36"}]'::jsonb)
from fresh;
select public.update_owner_onboarding_service(owner_id, workspace, 'Fresh Grill', 4::smallint, true,
  (select o.revision from public.workspace_onboarding o where o.workspace_id = fresh.workspace), 'Fay', null, 'Founder')
from fresh;
select is(
  (select p.is_excluded_from_schedule from public.employee_profiles p join fresh on p.workspace_id = fresh.workspace
   and p.user_id = fresh.owner_id),
  true, 'setup keeps the founder off the Schedule');
select is(
  (select j.system_key::text || ' @ ' || l.name
   from fresh
   join public.employee_profiles p on p.workspace_id = fresh.workspace and p.user_id = fresh.owner_id
   join public.employee_job_assignments ja on ja.employee_id = p.id and ja.ended_at is null and ja.is_primary
   join public.jobs j on j.id = ja.job_id
   join public.employee_location_assignments la on la.employee_id = p.id and la.ended_at is null and la.is_primary
   join public.locations l on l.id = la.location_id),
  'owner @ Mission', 'with the Owner job and their one location as primaries');

-- The test world's owner: setup with two locations made at once.
select is(
  (select j.system_key::text from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
   where a.employee_id = tests.id('ar:owner') and a.ended_at is null and a.is_primary),
  'owner', 'setup makes the Owner job the founder''s primary job');
select is(
  (select a.location_id from public.employee_location_assignments a
   where a.employee_id = tests.id('ar:owner') and a.ended_at is null and a.is_primary),
  (select l.id from public.locations l where l.workspace_id = tests.id('ar') order by l.created_at, l.name, l.id limit 1),
  'and the first location their primary location');
select is(
  (select count(*)::integer from public.employee_job_assignments a
   where a.employee_id = tests.id('ar:owner') and a.ended_at is null and a.is_primary),
  1, 'one primary job');

select * from finish();
rollback;
