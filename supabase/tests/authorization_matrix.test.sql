begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The authorization matrix (FOUNDATION-B stage 2b).
--
-- Every person below tries every action against every target, through the
-- same entry point the API calls, and the answer is compared with
-- pg_temp.expected(). expected() is the one place the product's permission
-- rules are written as code; it never reads the app's own role or scope
-- tables, so it is a specification the app is measured against, not a copy of
-- it. The rules are in docs/plan/REUSE.md, "Ürün kuralları — rol, kapsam,
-- uygunluk"; a rule changes there first, then here, then in the app.
--
-- A cell whose answer is still a product question returns 'decide:<id>' and
-- runs as a pgTAP TODO, so open questions print as a list without failing the
-- suite. A cell where the app is known to break a rule is listed in
-- pg_temp.known() and also runs as TODO; once the app is fixed, the cell fails
-- until its known() row is removed.
--
-- Stage 'legacy': today's ways of saying no all count as no (42501, P0002, a
-- NULL or empty answer). Stage 4 narrows this to 42501 with an authz.* hint.

-- 1. The world ------------------------------------------------------------------

select tests.world('m');
select tests.world('x');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('m', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('m', 'nur', 'manager', null, null);
select tests.role('m', 'shift lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('m') and r.system_key = 'manager'
    and rp.permission_key not in ('employees.manage', 'schedule.publish')
));
select tests.person('m', 'nil', 'shift lead', array['K'], array['cook']);
select tests.person('m', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['server']);
select tests.person('m', 'sami', 'manager', array['K'], array['cook'], 'suspended');
select tests.person('m', 'pelin', 'employee', array['K'], array['cook'], 'pending');
select tests.person('m', 'remzi', 'employee', array['B'], array['cook'], 'removed');
select tests.person('m', 'aydan', 'manager', array['K'], array['cook'], 'onboarding');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);

-- 2. Who they are, written down independently of the app ------------------------
-- class: owner | admin | manager | employee. status: active | suspended |
-- invited (no membership yet) | removed | restricted (onboarding not finished).

create temporary table persona (
  label text primary key,
  tenant text not null,
  class text not null,
  status text not null,
  locs text[] not null,
  permissions_removed text[] not null default '{}'
);
insert into persona values
  ('olcay',  'm', 'owner',    'active',     '{K,B}', '{}'),
  ('zeynep', 'm', 'admin',    'active',     '{K}',   '{}'),
  ('ayse',   'm', 'manager',  'active',     '{K}',   '{}'),
  ('mehmet', 'm', 'manager',  'active',     '{B}',   '{}'),
  ('can',    'm', 'manager',  'active',     '{K,B}', '{}'),
  ('nur',    'm', 'manager',  'active',     '{}',    '{}'),
  ('nil',    'm', 'manager',  'active',     '{K}',   '{employees.manage,schedule.publish}'),
  ('ali',    'm', 'employee', 'active',     '{K,B}', '{}'),
  ('emre',   'm', 'employee', 'active',     '{K}',   '{}'),
  ('veli',   'm', 'employee', 'active',     '{B}',   '{}'),
  ('sami',   'm', 'manager',  'suspended',  '{K}',   '{}'),
  ('pelin',  'm', 'employee', 'invited',    '{K}',   '{}'),
  ('remzi',  'm', 'employee', 'removed',    '{B}',   '{}'),
  ('aydan',  'm', 'manager',  'restricted', '{K}',   '{}'),
  ('xavier', 'x', 'owner',    'active',     '{K,B}', '{}');

create temporary table actor as
select p.label,
  case p.label when 'olcay' then tests.user('m:owner') when 'xavier' then tests.user('x:owner')
    else tests.user('m:' || p.label) end as user_id,
  case p.label when 'olcay' then tests.id('m:owner') when 'xavier' then tests.id('x:owner')
    else tests.id('m:' || p.label) end as employee_id
from persona p;

-- 3. What they act on -------------------------------------------------------------

create temporary table target (
  label text primary key,
  kind text not null,          -- person | location | workspace
  tenant text not null,
  locs text[],                 -- person: where they work; location: itself; null for none
  class text                   -- person: their rank
);
insert into target values
  ('emre',       'person',    'm', '{K}',   'employee'),
  ('veli',       'person',    'm', '{B}',   'employee'),
  ('ali',        'person',    'm', '{K,B}', 'employee'),
  ('ayse',       'person',    'm', '{K}',   'manager'),
  ('zeynep',     'person',    'm', '{K}',   'admin'),
  ('olcay',      'person',    'm', '{K,B}', 'owner'),
  ('xena',       'person',    'x', '{K}',   'employee'),
  ('K',          'location',  'm', '{K}',   null),
  ('B',          'location',  'm', '{B}',   null),
  ('x:K',        'location',  'x', '{K}',   null),
  ('none',       'location',  'm', null,    null),
  ('workspace',  'workspace', 'm', null,    null);

create temporary table target_id as
select t.label,
  case
    when t.label = 'olcay' then tests.id('m:owner')
    when t.label = 'xena' then tests.id('x:xena')
    when t.kind = 'person' then tests.id('m:' || t.label)
    when t.label in ('K', 'B') then tests.id('m:' || t.label)
    when t.label = 'x:K' then tests.id('x:K')
    when t.label = 'workspace' then tests.id('m')
  end as id
from target t;

-- 4. The actions, each on the entry point the API calls ---------------------------
-- The template runs with $1 = actor user id, $2 = workspace m, $3 = target id.
-- empty_is_no: a false/0/NULL answer means the actor was not let through (a
-- read that hides the row, or a browser write RLS filtered out).

create temporary table action (
  key text primary key,
  target_kind text not null,
  permission text,             -- the permission key the action needs
  owner_only boolean not null default false,
  empty_is_no boolean not null default false,
  template text not null
);
insert into action values
  ('employee.read', 'person', 'employees.read', false, true,
   $$select public.get_employee_detail_service($1, $2, $3) is not null$$),
  ('employee.list', 'person', 'employees.read', false, true,
   $$select exists (select 1 from public.list_employees_service($1, $2, false, '', 'all', 500, 0) e where e.id = $3)$$),
  ('employee.save', 'person', 'employees.manage', false, false,
   $$select public.save_employee_service($1, $2, $3,
       e.first_name, e.middle_name, e.last_name, e.preferred_name, e.invitation_email, e.start_date, e.internal_note,
       array(select l.location_id from public.employee_location_assignments l where l.employee_id = e.id and l.ended_at is null),
       (select l.location_id from public.employee_location_assignments l where l.employee_id = e.id and l.ended_at is null and l.is_primary limit 1),
       array(select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null),
       (select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null and j.is_primary limit 1),
       e.is_remote, e.is_excluded_from_schedule, e.revision) is not null
     from public.employee_profiles e where e.id = $3$$),
  ('employee.terminate', 'person', 'employees.archive', false, false,
   $$select public.terminate_employee_service($1, $2, $3, localtimestamp, 'Europe/Istanbul', 'block', 'matrix probe', gen_random_uuid()) is not null$$),
  ('employee.archive', 'person', 'employees.archive', false, false,
   $$select public.set_employee_archived_service($1, $2, $3, true) is not null$$),
  ('employee.remove_access', 'person', 'employees.manage', false, false,
   $$select public.remove_employee_access_service($1, $2, $3) is not null$$),
  ('employee.make_admin', 'person', null, true, false,
   $$select public.update_employee_membership_role_service($1, $2, $3,
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'admin')) is not null$$),
  ('employee.make_employee', 'person', 'employees.manage', false, false,
   $$select public.update_employee_membership_role_service($1, $2, $3,
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('employee.create', 'location', 'employees.manage', false, false,
   $$select public.create_employee_command_service($1, $2, gen_random_uuid(),
       jsonb_build_object('first_name', 'Probe', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
         'invitation_email', 'probe.' || gen_random_uuid() || '@world.test', 'start_date', '', 'internal_note', '',
         'location_ids', to_jsonb(array_remove(array[$3], null)), 'primary_location_id', $3,
         'job_ids', case when $3 is null then '[]'::jsonb else to_jsonb(array[(select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1)]) end,
         'primary_job_id', case when $3 is null then null else (select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1) end,
         'is_remote', $3 is null, 'is_excluded_from_schedule', false, 'expected_revision', null),
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('schedule.read', 'location', 'schedule.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.get_schedule_read_model_service($1, $2, tests.week(0)) -> 'locations') l
     where (l ->> 'id')::uuid = $3)$$),
  ('schedule.edit', 'workspace', 'schedule.manage', false, false,
   $$select public.acquire_schedule_edit_session_service($1, $2, tests.week(0), 'blank') is not null$$),
  ('settings.organization.write', 'workspace', null, false, true,
   $$select tests.as_browser($1, format('update public.workspaces set name = name where id = %L', $2)) > 0$$),
  ('settings.locations.write', 'workspace', null, false, true,
   $$select tests.as_browser($1, format(
       'insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone) values (%L, ''Probe'', ''PRB'', ''1 St'', ''C'', ''R'', ''1'', ''UTC'')', $2)) > 0$$),
  ('settings.jobs.write', 'workspace', null, false, false,
   $$select public.create_department_with_jobs_service($1, $2, '{"name": "Probe", "color": "#abcdef"}', '[]') is not null$$),
  ('settings.roles.write', 'workspace', null, false, false,
   $$select public.save_workspace_role_service($1, $2, null, 'Probe role', '', 'employee', array(
       select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
       where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('settings.scheduling.write', 'workspace', null, false, false,
   $$select public.update_scheduling_settings_service($1, $2, '{"week_start_day": "monday"}') is not null$$),
  ('workspace.close', 'workspace', null, true, false,
   $$select public.request_workspace_closure_service($1, $2, 'immediate', (select w.name from public.workspaces w where w.id = $2), true, null) is not null$$),
  ('workspace.transfer_ownership', 'workspace', null, true, false,
   $$select public.initiate_workspace_ownership_transfer_service($1, $2, tests.user('m:zeynep')) is not null$$);

-- 5. The rules ---------------------------------------------------------------------

create function pg_temp.rank(class text) returns integer language sql immutable as $$
  select case class when 'owner' then 4 when 'admin' then 3 when 'manager' then 2 when 'employee' then 1 else 0 end
$$;

create function pg_temp.expected(actor_label text, action_key text, target_label text)
returns text
language plpgsql
as $$
declare
  p persona;
  a action;
  t target;
  is_self boolean := target_label in ('self', actor_label);
  shares boolean;
  covers boolean;
begin
  select * into p from persona where label = actor_label;
  select * into a from action where key = action_key;
  if is_self then
    t := row('self', 'person', p.tenant, p.locs, p.class)::target;
  else
    select * into t from target where label = target_label;
  end if;

  -- Nobody reaches into another workspace, and only active members act at all.
  if p.tenant <> 'm' or t.tenant <> 'm' then return 'deny'; end if;
  if p.status <> 'active' then return 'deny'; end if;
  if a.permission is not null and a.permission = any (p.permissions_removed) then return 'deny'; end if;
  if a.owner_only and p.class <> 'owner' then return 'deny'; end if;
  if p.class = 'employee' then return 'deny'; end if;

  -- A manager's reach: where they work. An empty list reaches nowhere.
  shares := t.locs is not null and t.locs && p.locs;
  covers := t.locs is not null and cardinality(t.locs) > 0 and t.locs <@ p.locs;

  case action_key
  when 'employee.read', 'employee.list' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'employee.save' then
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      if t.class = 'owner' then return 'decide:admin-edits-owner-record'; end if;
      return 'allow';
    end if;
    if not shares then return 'deny'; end if;
    if is_self then return 'decide:manager-edits-own-record'; end if;
    if pg_temp.rank(t.class) >= pg_temp.rank('manager') then return 'decide:manager-edits-peer-or-senior-record'; end if;
    if not covers then return 'decide:manager-edits-person-shared-with-other-location'; end if;
    return 'allow';

  when 'employee.terminate', 'employee.archive' then
    -- Ending employment or archiving is admin and owner only; a manager only
    -- removes somebody from their own location (a separate action).
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' and pg_temp.rank(t.class) < pg_temp.rank('admin') then return 'allow'; end if;
    return 'deny';

  when 'employee.remove_access' then
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' and pg_temp.rank(t.class) < pg_temp.rank('admin') then return 'allow'; end if;
    if p.class = 'admin' then return 'deny'; end if;
    if not shares or pg_temp.rank(t.class) >= pg_temp.rank('manager') then return 'deny'; end if;
    return 'decide:manager-removes-access';

  when 'employee.make_admin' then
    -- Owner only (checked above); nobody changes their own role.
    return case when is_self or t.class = 'owner' then 'deny' else 'allow' end;

  when 'employee.make_employee' then
    if is_self or t.class = 'owner' then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then return case when t.class = 'admin' then 'deny' else 'allow' end; end if;
    if not shares or t.class <> 'employee' then return 'deny'; end if;
    return 'decide:manager-changes-employee-role';

  when 'employee.create' then
    if t.locs is null then
      return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;
    end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.read' then
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.edit' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when cardinality(p.locs) > 0 then 'allow' else 'deny' end;

  when 'settings.organization.write', 'settings.locations.write', 'settings.jobs.write',
       'settings.roles.write', 'settings.scheduling.write' then
    -- Managers read the catalog; they never write organization settings (D1).
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'workspace.close', 'workspace.transfer_ownership' then
    return 'allow';  -- owner only, checked above

  else
    raise exception 'expected(): no rule for action %', action_key;
  end case;
end;
$$;

-- 6. Where the app is known to break a rule today ---------------------------------
-- Each row names what is wrong and which stage fixes it. Matching cells run as
-- TODO. A row that no longer matches any failing cell fails the suite, so the
-- list can only shrink with the fixes. actors/targets match a label or a class;
-- null matches everything.

create temporary table known_gap (
  id text primary key,
  actors text[],
  actions text[] not null,
  targets text[],
  reason text not null
);
insert into known_gap values
  ('manager-hidden-peers', '{manager}', '{employee.read,employee.list}', '{self,ayse,zeynep,olcay}',
   'M2: a manager sees everyone who works at their locations; today their own record and managers, admins and the owner are hidden (stage 6, employees)'),
  ('manager-cannot-invite', '{manager}', '{employee.create}', '{K,B}',
   'a manager cannot add and invite an employee at their own location; employee_access.manage is required (stage 6, employees)'),
  ('owner-record-no-primary', '{olcay}', '{employee.save}', '{self,olcay}',
   'the owner record setup creates has no primary location or job, so saving it as it is fails with 23502 (stage 6, employees)'),
  ('admin-own-record', '{zeynep}', '{employee.save}', '{self,zeynep}',
   'an admin cannot save their own employee record, P0002 (stage 6, employees)'),
  ('empty-scope-edits', '{nur}', '{schedule.edit}', null,
   'a manager with no location can open schedule editing; an empty scope must reach nowhere, E2 (stage 3 and 4)'),
  ('admin-cannot-edit-roles', '{admin}', '{settings.roles.write}', null,
   'admins cannot edit roles, D2 (stage 6, settings)'),
  ('transfer-validates-first', '{zeynep}', '{workspace.transfer_ownership}', null,
   'a non-owner naming themselves gets the target check (23514) before the owner-only refusal; the no must come first (stage 4)');

create temporary table known_hit (id text primary key);

create function pg_temp.known(actor_label text, action_key text, target_label text)
returns text
language sql
stable
as $$
  select k.id from known_gap k
  where (k.actors is null or actor_label = any (k.actors)
         or (select p.class from persona p where p.label = actor_label) = any (k.actors))
    and action_key = any (k.actions)
    and (k.targets is null or target_label = any (k.targets))
  order by k.id
  limit 1
$$;

-- 7. The probe ----------------------------------------------------------------------
-- Runs one call and undoes it by raising a sentinel, so every cell starts from
-- the same world. TA1/TA2 are their own class: a handler for a code ending in
-- 000 would catch the whole class.

create function pg_temp.probe(template text, actor_id uuid, workspace_id uuid, target_id uuid, empty_is_no boolean)
returns text
language plpgsql
as $$
declare
  answer text;
  state text;
begin
  begin
    execute template into answer using actor_id, workspace_id, target_id;
    if empty_is_no and (answer is null or answer in ('false', 'f', '0')) then
      raise exception 'probe hidden' using errcode = 'TA002';
    end if;
    raise exception 'probe allowed' using errcode = 'TA001';
  exception
    when sqlstate 'TA001' then return 'allow';
    when sqlstate 'TA002' then return 'deny:empty';
    when others then
      get stacked diagnostics state = returned_sqlstate;
      if state in ('42501', 'P0002') then return 'deny:' || state; end if;
      return 'error:' || state || ' ' || left(sqlerrm, 100);
  end;
end;
$$;

create function pg_temp.run()
returns setof text
language plpgsql
as $$
declare
  c record;
  actual text;
  verdict text;
  wanted text;
  gap text;
  cell_label text;
begin
  for c in
    select p.label as actor, ac.user_id, a.key, a.template, a.empty_is_no,
      t.label as target,
      case when t.label = 'self' then ac.employee_id else ti.id end as target_id
    from persona p
    join actor ac on ac.label = p.label
    cross join action a
    join (select label, kind from target union all select 'self', 'person') t on t.kind = a.target_kind
    left join target_id ti on ti.label = t.label
    order by a.key, p.label, t.label
  loop
    actual := pg_temp.probe(c.template, c.user_id, tests.id('m'),
      case when c.target = 'none' then null else c.target_id end, c.empty_is_no);
    verdict := case when actual = 'allow' then 'allow' when actual like 'deny:%' then 'deny' else actual end;
    wanted := pg_temp.expected(c.actor, c.key, c.target);
    gap := pg_temp.known(c.actor, c.key, c.target);
    cell_label := format('%s | %s | %s', c.key, c.actor, c.target);

    if wanted like 'decide:%' then
      perform todo(wanted, 1);
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    elsif gap is not null and verdict <> wanted then
      insert into known_hit values (gap) on conflict do nothing;
      perform todo('known: ' || gap, 1);
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    else
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    end if;
  end loop;

  for gap in select k.id from known_gap k where not exists (select 1 from known_hit h where h.id = k.id) order by 1 loop
    return next fail('known gap ' || gap || ' no longer shows up; delete its row');
  end loop;
end;
$$;

select * from pg_temp.run();

select * from finish();
rollback;
