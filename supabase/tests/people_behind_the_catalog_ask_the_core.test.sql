begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The last callers of the old person helpers ask the authorization core
-- (FB-6.2 .6, P1): job assignments, catalog deletion, the dashboard's to-dos.
-- The rule each one follows is the Employees rule: whoever may read a record
-- sees it, whoever may save it changes its jobs; a location goes with
-- whoever may write locations (BL-187).

select tests.world('m');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
-- Manages Besiktas without taking shifts: assigned there and excluded from the
-- Schedule (EMP-001).
select tests.person('m', 'selin', 'manager', array['B'], array['cook']);
select tests.excluded('m', 'selin');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.world('x');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;

-- Putting somebody on a job, as Settings > Jobs > Assign does.
create function pg_temp.assign(actor text, person uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.update_job_assignments_service(%L, %L, %L, %L)',
    tests.user('m:' || actor), tests.id('m'), tests.id('m:job:server'),
    jsonb_build_array(jsonb_build_object('employee_id', person, 'assigned', true,
      'expected_revision', coalesce((select e.revision from public.employee_profiles e where e.id = person), 1)))))
$$;

-- Who the Assign drawer lists, and whom it lets the actor change.
create function pg_temp.listed(actor text, person text) returns text language sql as $$
  select coalesce((
    select case when (c ->> 'can_manage')::boolean then 'manages' else 'reads' end
    from jsonb_array_elements(public.read_job_assignments_service(
      tests.user('m:' || actor), tests.id('m'), tests.id('m:job:server'), '', null, 'all', 0, false) -> 'employees') c
    where (c ->> 'employee_id')::uuid = tests.id('m:' || person)), 'hidden')
$$;

-- 1. Job assignments ---------------------------------------------------------------

select is(pg_temp.assign('ayse', tests.id('m:emre')), 'allowed',
  'a manager puts an employee at their location on a job');
select is(pg_temp.assign('selin', tests.id('m:veli')), 'allowed',
  'a manager excluded from the Schedule puts somebody at their location on a job');
select is(pg_temp.assign('ayse', tests.id('m:veli')), '42501 authz.out_of_scope',
  'not somebody at another location');
select is(pg_temp.assign('ayse', tests.id('m:owner')), '42501 authz.rank',
  'not the owner who works at their location');
select is(pg_temp.assign('zeynep', tests.id('m:kaan')), '42501 authz.rank',
  'an admin does not change another admin''s jobs (KK-24)');
select is(pg_temp.assign('ayse', gen_random_uuid()), '42501 authz.out_of_scope',
  'an unknown person gets the answer somebody out of reach gets');
select is(pg_temp.assign('ayse', tests.id('x:xena')), '42501 authz.out_of_scope',
  'and so does somebody in another workspace');
select is(pg_temp.assign('emre', tests.id('m:emre')), '42501 authz.missing_permission',
  'an employee assigns nobody');

select is(pg_temp.listed('ayse', 'owner'), 'reads',
  'the Assign drawer lists the owner at the manager''s location, read-only (M2, KK-8)');
select is(pg_temp.listed('ayse', 'zeynep'), 'reads', 'and the admin there, read-only');
select is(pg_temp.listed('ayse', 'veli'), 'hidden', 'nobody from another location');
select is(pg_temp.listed('mehmet', 'selin'), 'reads',
  'a manager excluded from the Schedule is there for their location''s other manager');
select is(pg_temp.listed('owner', 'zeynep'), 'manages', 'the owner changes an admin''s jobs');
select is(pg_temp.listed('zeynep', 'kaan'), 'reads', 'an admin reads another admin''s');
select is(
  (select (c ->> 'employee_count')::integer
   from jsonb_array_elements(public.organization_job_counts_service(tests.user('m:ayse'), tests.id('m')) -> 'jobs') c
   where (c ->> 'id')::uuid = tests.id('m:job:server')),
  2, 'Settings > Jobs counts the people the manager may read: the admin and the employee at Kadikoy'
);
select is(
  pg_temp.refusal(format('select public.organization_job_counts_service(%L, %L)', tests.user('m:emre'), tests.id('m'))),
  '42501 authz.missing_permission', 'an employee reads no job counts'
);

-- 2. The dashboard's to-dos (Workspace home) --------------------------------------------
-- A to-do about somebody is for whoever may read their record.

create function pg_temp.todo(actor text, person uuid) returns text language sql as $$
  select pg_temp.refusal(format('select public.create_workspace_todo_service(%L, %L, %L, %L, %L, null)',
    tests.user('m:' || actor), tests.id('m'), 'Follow up', '', person))
$$;

select is(pg_temp.todo('ayse', tests.id('m:owner')), 'allowed',
  'a manager writes a to-do about the owner at their location (M2)');
select is(pg_temp.todo('mehmet', tests.id('m:selin')), 'allowed',
  'about a manager excluded from the Schedule, for their location''s other manager');
select is(pg_temp.todo('ayse', tests.id('m:veli')), '42501 authz.out_of_scope',
  'not about somebody at another location');
select is(pg_temp.todo('ayse', gen_random_uuid()), '42501 authz.out_of_scope',
  'an unknown person gets the answer somebody out of reach gets');
select is(pg_temp.todo('emre', null), '42501 authz.missing_permission', 'an employee writes no to-do');

select tests.remember('m:todo:veli', (public.create_workspace_todo_service(
  tests.user('m:owner'), tests.id('m'), 'About Veli', '', tests.id('m:veli'), null) ->> 'id')::uuid);
select tests.remember('m:todo:zeynep', (public.create_workspace_todo_service(
  tests.user('m:owner'), tests.id('m'), 'About Zeynep', '', tests.id('m:zeynep'), null) ->> 'id')::uuid);
select is(
  pg_temp.refusal(format('select public.resolve_workspace_todo_service(%L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:todo:veli'))),
  '42501 authz.out_of_scope', 'a manager resolves no to-do about somebody at another location'
);
select ok(
  exists (select 1 from jsonb_array_elements(public.get_workspace_dashboard_service(tests.user('m:ayse'), tests.id('m')) -> 'todos') t
          where (t ->> 'id')::uuid = tests.id('m:todo:zeynep')),
  'the manager''s Workspace home lists the to-do about the admin at their location'
);
select ok(
  not exists (select 1 from jsonb_array_elements(public.get_workspace_dashboard_service(tests.user('m:ayse'), tests.id('m')) -> 'todos') t
              where (t ->> 'id')::uuid = tests.id('m:todo:veli')),
  'and not the one about somebody at another location'
);
select tests.time_off('m', 'veli');
select is(
  (public.get_workspace_dashboard_service(tests.user('m:selin'), tests.id('m')) #>> '{metrics,pending_time_off_count}')::integer,
  1, 'a manager excluded from the Schedule counts their location''s pending time off on Workspace home'
);
select is(
  pg_temp.refusal(format('select public.get_workspace_dashboard_service(%L, %L)', tests.user('m:emre'), tests.id('m'))),
  '42501 authz.missing_permission', 'an employee opens no manager Workspace home'
);

-- The to-do list and Workspace home have one gate, the core's workspace.todos
-- (KK-32, nf-guvenlik D1/D2): the owner, an admin and a manager keep the list
-- as before; a closed workspace and a missing required document now refuse
-- the home too.
select is(app_private.authz_reason(tests.user('m:ayse'), tests.id('m'), 'workspace.todos'), null,
  'the core lets a manager keep the workspace''s to-do list, as the service always did');
select is(app_private.authz_reason(tests.user('m:emre'), tests.id('m'), 'workspace.todos'), 'missing_permission',
  'and not an employee');
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
     and p.prosrc ~ '(authorize_workspace_todos|workspace_todo_actor_role)\s*\('),
  0, 'nobody asks the to-do list''s own gate any more'
);
select is(
  (select count(*)::integer from pg_proc p
   where p.oid in ('public.create_workspace_todo_service(uuid,uuid,text,text,uuid,timestamptz)'::regprocedure,
                   'public.resolve_workspace_todo_service(uuid,uuid,uuid)'::regprocedure,
                   'public.get_workspace_dashboard_service(uuid,uuid)'::regprocedure)
     and p.prosrc ~ 'app_private\.authorize\([^;]*''workspace\.todos'''),
  3, 'writing, resolving and opening Workspace home ask the core''s workspace.todos'
);

select tests.world('c');
select tests.person('c', 'cem', 'manager', array['K'], array['cook']);
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('c');
select is(
  pg_temp.refusal(format('select public.get_workspace_dashboard_service(%L, %L)', tests.user('c:cem'), tests.id('c'))),
  '42501 authz.workspace_closed', 'a manager of a closed workspace opens no Workspace home (D2)'
);
select is(
  pg_temp.refusal(format('select public.create_workspace_todo_service(%L, %L, %L, %L, null, null)',
    tests.user('c:cem'), tests.id('c'), 'Follow up', '')),
  '42501 authz.workspace_closed', 'nor writes a to-do there'
);

-- workspace.todos is labelled read (KK-34); the label must give no write gate
-- away: a member still onboarding is refused as well.
select tests.world('r');
select tests.person('r', 'nur', 'manager', array['K'], array['cook'], 'onboarding');
select is(
  pg_temp.refusal(format('select public.get_workspace_dashboard_service(%L, %L)', tests.user('r:nur'), tests.id('r'))),
  '42501 authz.not_active', 'a manager still finishing their onboarding opens no Workspace home'
);
select is(
  pg_temp.refusal(format('select public.create_workspace_todo_service(%L, %L, %L, %L, null, null)',
    tests.user('r:nur'), tests.id('r'), 'Follow up', '')),
  '42501 authz.not_active', 'nor writes a to-do'
);

select tests.world('d');
select tests.person('d', 'dora', 'manager', array['K'], array['cook']);
-- ponytail: the deadline is moved into the past by hand, as in schedule_asks_the_core.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('d:owner'), tests.id('d'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('d:owner'), tests.id('d'), id);
select public.set_document_publication_service(tests.user('d:owner'), tests.id('d'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('d:dora');
select is(
  pg_temp.refusal(format('select public.get_workspace_dashboard_service(%L, %L)', tests.user('d:dora'), tests.id('d'))),
  '42501 authz.document_blocked', 'a manager missing a required document opens no Workspace home (D2)'
);
select is(
  pg_temp.refusal(format('select public.create_workspace_todo_service(%L, %L, %L, %L, null, null)',
    tests.user('d:dora'), tests.id('d'), 'Follow up', '')),
  '42501 authz.document_blocked', 'nor writes a to-do'
);

-- 3. Deleting a job or a location ------------------------------------------------------

select is(
  pg_temp.refusal(format('select public.delete_job_with_assignments_service(%L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:job:server'))),
  '42501 authz.missing_permission', 'a manager deletes no job'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), 'locations', tests.id('m:K'))),
  '42501 authz.missing_permission', 'a manager deletes no location (BL-187: not theirs to delete)'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:zeynep'), tests.id('m'), 'locations', tests.id('m:B'))),
  'allowed', 'an admin deletes a location, whoever works there (BL-187)'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:owner'), tests.id('m'), 'locations', tests.id('m:K'))),
  'allowed', 'the owner deletes a location they work at themselves (BL-187)'
);

select * from finish();
rollback;
