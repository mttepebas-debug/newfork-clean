begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- ROL-CIFT 1.3 (KARARLAR S-168; design §4.13): every management access keeps a Management job.
-- Setup makes Management with Owner, General Manager and Assistant Manager; the last Management job,
-- and anybody's one Management job, does not leave Management (archived, deleted or moved), and the
-- refusal names who it would leave without one; the Owner job follows the owner.
--
-- ponytail: people are inserted by hand, as in membership_two_access_slots (the test world reads the two
-- slots from 1.4 on); profiles go in with triggers off.

insert into auth.users (id, email, created_at) values
  ('c1300000-0000-4000-8000-000000000001', 'rules-olcay@example.test', now()),
  ('c1300000-0000-4000-8000-000000000002', 'rules-mona@example.test', now()),
  ('c1300000-0000-4000-8000-000000000003', 'rules-nora@example.test', now()),
  ('c1300000-0000-4000-8000-000000000004', 'rules-ayla@example.test', now());
insert into public.workspaces (id, name, created_by, lifecycle_status) values
  ('c1300000-0000-4000-8000-000000000101', 'Rules Co', 'c1300000-0000-4000-8000-000000000001', 'active'),
  ('c1300000-0000-4000-8000-000000000102', 'Bare Co', 'c1300000-0000-4000-8000-000000000003', 'active');
create temporary table slot_role as
select r.workspace_id, r.system_key::text as key, r.id from public.workspace_roles r
where r.workspace_id in ('c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000102')
  and r.system_key is not null;

set local session_replication_role = replica;
insert into public.employee_profiles (workspace_id, user_id, employee_code, first_name, last_name, created_by) values
  ('c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000001', 'E-000001', 'Olcay', 'Owner', 'c1300000-0000-4000-8000-000000000001'),
  ('c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000002', 'E-000002', 'Mona', 'Person', 'c1300000-0000-4000-8000-000000000001'),
  ('c1300000-0000-4000-8000-000000000102', 'c1300000-0000-4000-8000-000000000003', 'E-000001', 'Nora', 'Owner', 'c1300000-0000-4000-8000-000000000003'),
  ('c1300000-0000-4000-8000-000000000102', 'c1300000-0000-4000-8000-000000000004', 'E-000002', 'Ayla', 'Admin', 'c1300000-0000-4000-8000-000000000003');
insert into public.departments (id, workspace_id, name) values
  ('c1300000-0000-4000-8000-000000000302', 'c1300000-0000-4000-8000-000000000101', 'Kitchen');
set local session_replication_role = origin;

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, status) values
  ('c1300000-0000-4000-8000-000000000501', 'c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000001',
   (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000101' and key = 'owner'), 'active'),
  ('c1300000-0000-4000-8000-000000000502', 'c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000002',
   (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000101' and key = 'manager'), 'active'),
  ('c1300000-0000-4000-8000-000000000503', 'c1300000-0000-4000-8000-000000000102', 'c1300000-0000-4000-8000-000000000003',
   (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000102' and key = 'owner'), 'active'),
  ('c1300000-0000-4000-8000-000000000504', 'c1300000-0000-4000-8000-000000000102', 'c1300000-0000-4000-8000-000000000004',
   (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000102' and key = 'admin'), 'active');

-- What a refusal says: its code, hint and detail.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare code text; hint text; detail text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, hint = pg_exception_hint, detail = pg_exception_detail;
  return code || '|' || coalesce(hint, '') || '|' || coalesce(detail, '');
end;
$$;
create function pg_temp.job(w uuid, job_name text) returns uuid language sql as $$
  select j.id from public.jobs j where j.workspace_id = w and j.name = job_name and j.deleted_at is null
$$;
create function pg_temp.holds(m uuid) returns text[] language sql as $$
  select coalesce(array_agg(j.name order by j.name), '{}')
  from public.membership_management_jobs x join public.jobs j on j.id = x.job_id where x.membership_id = m
$$;

-- Setup's catalog ----------------------------------------------------------------------------------------
select app_private.ensure_management_and_owner('c1300000-0000-4000-8000-000000000101');
select app_private.ensure_management_and_owner('c1300000-0000-4000-8000-000000000102');
select is(
  (select array_agg(j.name || coalesce(' [' || j.system_key || ']', '') order by j.name)
   from public.jobs j join public.departments d on d.id = j.department_id and d.system_key = 'management'
   where j.workspace_id = 'c1300000-0000-4000-8000-000000000101'),
  array['Assistant Manager', 'General Manager', 'Owner [owner]'],
  'a new workspace''s Management holds Owner, General Manager and Assistant Manager, and no Manager'
);
select is(pg_temp.holds('c1300000-0000-4000-8000-000000000501'), array['Owner'],
  'and the owner holds the Owner job on the management side');

-- The Owner job follows the owner (ownership transfer) ----------------------------------------------------
insert into public.membership_management_jobs (workspace_id, membership_id, job_id) values
  ('c1300000-0000-4000-8000-000000000102', 'c1300000-0000-4000-8000-000000000504',
   pg_temp.job('c1300000-0000-4000-8000-000000000102', 'Assistant Manager'));
select set_config('app.owner_transfer', 'on', true);
update public.workspace_memberships
set role_id = (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000102' and key = 'owner')
where id = 'c1300000-0000-4000-8000-000000000504';
update public.workspace_memberships
set role_id = (select id from slot_role where workspace_id = 'c1300000-0000-4000-8000-000000000102' and key = 'admin')
where id = 'c1300000-0000-4000-8000-000000000503';
select set_config('app.owner_transfer', '', true);
select is(pg_temp.holds('c1300000-0000-4000-8000-000000000504'), array['Assistant Manager', 'Owner'],
  'Ayla, the new owner, holds the Owner job next to her own');
select is(pg_temp.holds('c1300000-0000-4000-8000-000000000503'), array['General Manager'],
  'Nora, the owner before her, keeps a Management job: General Manager');

-- The last one stays, by name -------------------------------------------------------------------------------
insert into public.membership_management_jobs (workspace_id, membership_id, job_id) values
  ('c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000502',
   pg_temp.job('c1300000-0000-4000-8000-000000000101', 'General Manager'));
select is(
  pg_temp.refusal(format('update public.jobs set archived_at = now() where id = %L',
    pg_temp.job('c1300000-0000-4000-8000-000000000101', 'General Manager'))),
  '22023|jobs.last_management_job|{"people": ["Mona Person"]}',
  'General Manager, Mona''s one Management job, is not archived, and the refusal names her'
);
select is(
  pg_temp.refusal(format('update public.jobs set department_id = %L where id = %L',
    'c1300000-0000-4000-8000-000000000302', pg_temp.job('c1300000-0000-4000-8000-000000000101', 'General Manager'))),
  '22023|jobs.last_management_job|{"people": ["Mona Person"]}',
  'nor moved to Kitchen, where it would be no Management job'
);
insert into public.membership_management_jobs (workspace_id, membership_id, job_id) values
  ('c1300000-0000-4000-8000-000000000101', 'c1300000-0000-4000-8000-000000000502',
   pg_temp.job('c1300000-0000-4000-8000-000000000101', 'Assistant Manager'));
select is(
  pg_temp.refusal(format('update public.jobs set archived_at = now() where id = %L',
    pg_temp.job('c1300000-0000-4000-8000-000000000101', 'General Manager'))),
  'allowed',
  'once Mona also holds Assistant Manager, General Manager is archived'
);
select is(pg_temp.holds('c1300000-0000-4000-8000-000000000502'), array['Assistant Manager'],
  'and Mona keeps Assistant Manager alone');
select is(
  pg_temp.refusal(format('update public.jobs set deleted_at = now(), archived_at = now() where id = %L',
    pg_temp.job('c1300000-0000-4000-8000-000000000101', 'Assistant Manager'))),
  '22023|jobs.last_management_job|{"people": ["Mona Person"]}',
  'Assistant Manager, now the last Management job and Mona''s only one, is not deleted'
);

-- In Bare Co only Nora holds General Manager: the last job a manager could hold stays.
select is(
  pg_temp.refusal(format('update public.jobs set archived_at = now() where id = %L',
    pg_temp.job('c1300000-0000-4000-8000-000000000102', 'Assistant Manager'))),
  'allowed',
  'Assistant Manager leaves Bare Co''s Management while General Manager stays (Ayla keeps the Owner job)'
);
select is(
  pg_temp.refusal(format('update public.jobs set archived_at = now() where id = %L',
    pg_temp.job('c1300000-0000-4000-8000-000000000102', 'General Manager'))),
  '22023|jobs.last_management_job|{"people": ["Nora Owner"]}',
  'General Manager, the last job a manager could hold and Nora''s only one, stays'
);

select * from finish();
rollback;
