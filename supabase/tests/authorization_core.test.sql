begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- The authorization core (FOUNDATION-B stage 4a): how it says no, what a
-- blank, unknown or foreign target gets, what scope_set() returns, and what
-- changing the scope model changes. Who may do what is the matrix's job
-- (authorization_matrix.test.sql asks the core in every cell); this file holds
-- the core to its contract. document_blocked has no case here yet: the builder
-- cannot make a missing required document (stage 6, documents).

select tests.world('ac');
select tests.world('other');
select tests.person('ac', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('ac', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ac', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ac', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('ac', 'veli', 'employee', array['B'], array['server']);
select tests.person('ac', 'sami', 'manager', array['K'], array['cook'], 'suspended');

create function pg_temp.said(statement text) returns text
language plpgsql
as $$
declare
  code text;
  reason text;
  what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;

create function pg_temp.reason(person text, action text, places uuid[] default null, target uuid default null)
returns text
language sql
as $$
  select coalesce(app_private.authz_reason(tests.user('ac:' || person), tests.id('ac'), action, places, target), 'allowed')
$$;

-- 1. The one way to say no --------------------------------------------------------------

select is(
  pg_temp.said(format($$select app_private.authorize(%L, %L, 'settings.jobs.write')$$, tests.user('ac:ayse'), tests.id('ac'))),
  '42501 authz.missing_permission settings.jobs.write',
  'a no is 42501, the reason in the hint and the action in the detail'
);
select is(
  pg_temp.said(format($$select app_private.authorize(%L, %L, 'settings.jobs.write')$$, tests.user('ac:owner'), tests.id('ac'))),
  'allowed',
  'a yes returns quietly'
);
select ok(
  pg_temp.said(format($$select app_private.authorize(%L, %L, 'no.such.action')$$, tests.user('ac:owner'), tests.id('ac'))) like '22023%',
  'an action the core does not know is a programming error, not a no'
);
select is(
  array(
    select distinct m[1] from pg_proc p, regexp_matches(p.prosrc, 'return ''([a-z_]+)''', 'g') m
    where p.oid = 'app_private.authz_check'::regproc
    order by 1
  ),
  array['document_blocked', 'missing_permission', 'not_active', 'not_member', 'out_of_scope', 'owner_only', 'rank', 'workspace_closed'],
  'the core says no for one of eight reasons'
);

-- 2. Each reason, in its order ----------------------------------------------------------

select is(
  coalesce(app_private.authz_reason(null, tests.id('ac'), 'schedule.read', array[tests.id('ac:K')]), 'allowed'),
  'not_member', 'nobody signed in is not a member'
);
select is(
  coalesce(app_private.authz_reason(tests.user('other:owner'), tests.id('ac'), 'schedule.read', array[tests.id('ac:K')]), 'allowed'),
  'not_member', 'the owner of another workspace is not a member here'
);
select is(pg_temp.reason('sami', 'schedule.read', array[tests.id('ac:K')]), 'not_active', 'a suspended manager is not active');
select is(pg_temp.reason('zeynep', 'workspace.close'), 'owner_only', 'closing the workspace is the owner''s');
select is(pg_temp.reason('ayse', 'settings.jobs.write'), 'missing_permission', 'a manager does not write organization settings');
select is(pg_temp.reason('emre', 'schedule.read', array[tests.id('ac:K')]), 'missing_permission', 'an employee does not read the management schedule');
select is(pg_temp.reason('zeynep', 'employee.terminate', null, tests.id('ac:zeynep')), 'rank', 'nobody ends their own employment');
select is(pg_temp.reason('zeynep', 'employee.terminate', null, tests.id('ac:owner')), 'rank', 'an admin does not end the owner''s employment');
select is(pg_temp.reason('ayse', 'schedule.read', array[tests.id('ac:B')]), 'out_of_scope', 'a manager does not reach another location');

update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('ac');
select is(pg_temp.reason('owner', 'schedule.read', array[tests.id('ac:K')]), 'workspace_closed', 'a suspended workspace is closed to everyone');
update public.workspaces set lifecycle_status = 'active' where id = tests.id('ac');

-- 3. Blank, unknown and foreign targets -------------------------------------------------

select is(pg_temp.reason('owner', 'schedule.read'), 'out_of_scope', 'no location is not every location');
select is(pg_temp.reason('owner', 'schedule.read', array[null]::uuid[]), 'out_of_scope', 'a blank location is not every location');
select is(pg_temp.reason('owner', 'schedule.read', '{}'), 'out_of_scope', 'one place means exactly one location');
select is(pg_temp.reason('owner', 'schedule.edit', '{}'), 'allowed', 'an empty set is the whole organization, open to the owner');
select is(pg_temp.reason('ayse', 'schedule.edit', '{}'), 'out_of_scope', 'and closed to a manager');
-- FB-6.7 K1: a record at several locations or the whole workspace is the org's.
select is(pg_temp.reason('owner', 'announcement.write_wide'), 'allowed', 'K1: the owner writes for the whole workspace');
select is(pg_temp.reason('ayse', 'announcement.write_wide'), 'out_of_scope', 'K1: a manager does not');
select is(pg_temp.reason('owner', 'schedule.read', array[tests.id('other:K')]), 'out_of_scope', 'a location in another workspace is out of reach, even for the owner');
select is(
  pg_temp.reason('ayse', 'employee.read', null, gen_random_uuid()),
  pg_temp.reason('ayse', 'employee.read', null, tests.id('ac:veli')),
  'somebody who does not exist gets the same answer as somebody out of reach'
);
select is(pg_temp.reason('ayse', 'employee.read', null, tests.id('ac:ali')), 'allowed', 'a manager reads a person who also works elsewhere');
select is(
  coalesce(app_private.authz_reason(tests.user('ac:sami'), tests.id('ac'), 'membership.read', null, null, tests.user('ac:sami')), 'allowed'),
  'allowed', 'a suspended person still reads their own membership, named by their account'
);

-- 4. scope_set(): where an action reaches, never null -----------------------------------

select is(app_private.scope_set(tests.user('ac:ayse'), tests.id('ac'), 'schedule.read'), array[tests.id('ac:K')], 'a manager reaches where they work');
select is(
  app_private.scope_set(tests.user('ac:owner'), tests.id('ac'), 'schedule.read'),
  array(select l.id from public.locations l where l.workspace_id = tests.id('ac') order by l.id),
  'the owner reaches every location'
);
select is(app_private.scope_set(tests.user('ac:sami'), tests.id('ac'), 'schedule.read'), '{}'::uuid[], 'a suspended manager reaches nowhere');
select is(app_private.scope_set(tests.user('other:owner'), tests.id('ac'), 'schedule.read'), '{}'::uuid[], 'somebody from another workspace reaches nowhere');

-- 5. rls_can(): the same answer for the signed-in browser user ----------------------------

select set_config('request.jwt.claims', json_build_object('sub', tests.user('ac:ayse'), 'role', 'authenticated')::text, true);
select ok(app_private.rls_can(tests.id('ac'), 'schedule.read', array[tests.id('ac:K')]), 'the signed-in manager may read their location');
select ok(not app_private.rls_can(tests.id('ac'), 'schedule.read', array[tests.id('ac:B')]), 'and not another');
select tests.settle();

-- 6. The scope model is one row -------------------------------------------------------------

select is(
  (select count(*)::integer
   from (select distinct scope_class, effect from app_private.authz_actions where scope_class not in ('account', 'own')) used
   cross join (values ('M1'), ('M2'), ('M3'), ('M4')) model (name)
   where not exists (
     select 1 from app_private.authz_scope_rules r
     where r.model = model.name and r.scope_class = used.scope_class and r.effect = used.effect)),
  0,
  'every model says how far a manager reaches for every kind of action'
);

update app_private.authz_settings set scope_model = 'M1';
select is(pg_temp.reason('ayse', 'employee.save', null, tests.id('ac:ali')), 'out_of_scope', 'M1: editing a person needs every one of their locations');

update app_private.authz_settings set scope_model = 'M3';
select is(pg_temp.reason('ayse', 'schedule.read', array[tests.id('ac:B')]), 'allowed', 'M3: a manager reads every location');
select is(pg_temp.reason('ayse', 'schedule.publish', array[tests.id('ac:B')]), 'out_of_scope', 'M3: and publishes only their own');

update app_private.authz_settings set scope_model = 'M4';
select is(pg_temp.reason('ayse', 'schedule.publish', array[tests.id('ac:B')]), 'allowed', 'M4: a manager publishes anywhere');
select is(pg_temp.reason('ayse', 'employee.terminate', null, tests.id('ac:veli')), 'allowed', 'M4: and ends anybody''s employment below them');
select is(pg_temp.reason('ayse', 'settings.jobs.write'), 'missing_permission', 'M4: but still writes no organization settings');

update app_private.authz_settings set scope_model = 'M2';
select is(pg_temp.reason('ayse', 'employee.save', null, tests.id('ac:ali')), 'allowed', 'M2: a manager edits a person who also works elsewhere');

-- 7. The one call that tells the API who is asking (stage 4c) ------------------------

create temporary table context_of as
select person, c.*
from (values ('owner'), ('ayse'), ('emre')) who (person)
cross join lateral public.resolve_workspace_context_service(tests.user('ac:' || who.person), tests.id('ac')) c;

select ok(
  (select 'settings.jobs.write' = any (actions) and 'workspace.close' = any (actions) from context_of where person = 'owner'),
  'the owner may write settings and close the workspace'
);
select ok(
  (select 'schedule.edit' = any (actions) and not 'settings.jobs.write' = any (actions) from context_of where person = 'ayse'),
  'a manager may edit schedules and may not write organization settings'
);
select is(
  (select array(select a from unnest(actions) a where a not in (
     select key from app_private.authz_actions where scope_class in ('account', 'own'))) from context_of where person = 'emre'),
  '{}'::text[],
  'an employee may take their own actions and nothing else'
);
select is((select location_ids from context_of where person = 'ayse'), array[tests.id('ac:K')], 'a manager''s locations are where they work');
select is((select location_ids from context_of where person = 'owner'), '{}'::uuid[], 'the owner is not limited to locations');
select is(
  (select count(*)::integer from public.resolve_workspace_context_service(tests.user('ac:sami'), tests.id('ac'))),
  0,
  'a suspended member gets no context'
);

select * from finish();
rollback;
