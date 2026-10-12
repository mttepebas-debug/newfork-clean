-- BL-276 (the rest): the last entry points that asked the old permission
-- helper (public.service_actor_has_permission) about roles and notification
-- settings ask the authorization core instead. The old helper looked at the
-- role's permission keys only: a closed workspace, the M2 scope model and the
-- one way to say no were not its business. After this migration the old helper
-- is asked by the three setup checklist services alone; they wait for the
-- product question of who sees the checklist (SORULAR Soru-16, BL-808).
--
--   app_private.can_edit_role            settings.roles.write (was roles.manage, by key)
--   save_workspace_role_service          settings.roles.write first, then the rank rule
--   delete_workspace_role_service        the same
--   get_notification_settings_service    settings.notifications.read; can_write = settings.notifications.write
--   save_notification_policy_service     settings.notifications.write
--   reset_notification_policies_service  settings.notifications.write
--   preview_notification_policy_service  settings.notifications.test (new action, notifications.test_send)
--   app_private.workspace_has_permission the RLS helper reads the core's actor state
--
-- Nobody gets further than before. The permission keys stay the same; what the
-- core adds is no: a closed workspace refuses, and a manager never writes the
-- organization's settings (M2 org/write = none; GUVENLIK-A GA-2 already took
-- those keys off manager and employee roles). The organization-wide scope
-- checks the notification writes kept for themselves (all_locations,
-- membership_location_scopes) go: after settings.notifications.write only the
-- owner and admins are left, and both reach every location.
--
-- The functions change on the definitions the database holds
-- (pg_get_functiondef), on top of the refusal hints of BL-1049: each anchor must
-- be found exactly as often as expected, or nothing changes.

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'settings ask the core: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

-- 1. The test send preview has an action of its own: its permission
-- (notifications.test_send) is not the settings write, and the owner keeps it
-- on the Admin role apart from the settings switches.
insert into app_private.authz_actions (key, scope_class, effect, permission_key)
values ('settings.notifications.test', 'org', 'write', 'notifications.test_send');

-- 2. Roles.
create or replace function app_private.can_edit_role(actor uuid, w uuid, rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles ar on ar.id=m.role_id
 left join public.workspace_roles target on target.id=rid and target.workspace_id=w
 where m.user_id=actor and m.workspace_id=w and m.status='active' and m.role_id is distinct from rid
 and app_private.authz_reason(actor,w,'settings.roles.write') is null
 and (rid is null or (target.id is not null and target.access_class<>'owner'))
 and (ar.access_class='owner' or (ar.access_class='admin' and (rid is null or target.access_class in ('manager','employee')))));
$$;

-- The core answers first, with its own reason; what is left is the rank rule
-- (an admin edits manager and employee roles, nobody their own or the owner's)
-- and a role that is not this workspace's.
select pg_temp.patch('public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamp with time zone)', array[
  $a$ if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;$a$,
  $a$ perform app_private.authorize(actor_user_id,target_workspace_id,'settings.roles.write');
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501',hint=case when target_role_id is not null and not exists(select 1 from public.workspace_roles r where r.id=target_role_id and r.workspace_id=target_workspace_id) then 'authz.out_of_scope' else 'authz.rank' end; end if;$a$, '1',
  -- An admin hands on only what the core says the admin holds.
  $a$not public.service_actor_has_permission(actor_user_id,target_workspace_id,k))$a$,
  $a$not k = any ((select (app_private.actor(actor_user_id,target_workspace_id)).permissions)::text[]))$a$, '1',
  $a$'Cannot grant access beyond your own permissions' using errcode='42501';$a$,
  $a$'Cannot grant access beyond your own permissions' using errcode='42501',hint='authz.missing_permission';$a$, '1'
]);

select pg_temp.patch('public.delete_workspace_role_service(uuid,uuid,uuid)', array[
  $a$ if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;$a$,
  $a$ perform app_private.authorize(actor_user_id,target_workspace_id,'settings.roles.write');
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501',hint=case when not exists(select 1 from public.workspace_roles r where r.id=target_role_id and r.workspace_id=target_workspace_id) then 'authz.out_of_scope' else 'authz.rank' end; end if;$a$, '1'
]);

-- 3. Notification settings.
select pg_temp.patch('public.get_notification_settings_service(uuid,uuid)', array[
  $a$  if not (
    public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.read')
    or public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write')
  ) then
    raise exception 'notification settings read access required' using errcode = '42501';
  end if;

  can_write := public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'notifications.settings.write'
  );$a$,
  $a$  -- The write needs the read (role_permission_dependencies), so the read is the door.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.notifications.read');

  can_write := app_private.authz_reason(actor_user_id, target_workspace_id, 'settings.notifications.write') is null;$a$, '1'
]);

select pg_temp.patch('public.save_notification_policy_service(uuid,uuid,text,integer,text,uuid,integer,boolean,text[],text,text)', array[
  $a$  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write') then
    raise exception 'notification settings write access required' using errcode = '42501';
  end if;$a$,
  $a$  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.notifications.write');$a$, '1',
  $a$  select * into membership_row
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if target_scope_kind = 'global' then
    if target_scope_id is not null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;$a$,
  $a$  if target_scope_kind = 'global' then
    if target_scope_id is not null then
      raise exception 'notification policy scope is invalid' using errcode = '22023';
    end if;$a$, '1',
  $a$    if target_scope_id is null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;$a$,
  $a$    if target_scope_id is null then
      raise exception 'notification policy scope is invalid' using errcode = '22023';
    end if;$a$, '1',
  $a$      raise exception 'notification role scope not found' using errcode = '42501';$a$,
  $a$      raise exception 'notification role scope not found' using errcode = '42501', hint = 'authz.out_of_scope';$a$, '1',
  $a$      raise exception 'notification location scope not found' using errcode = '42501';$a$,
  $a$      raise exception 'notification location scope not found' using errcode = '42501', hint = 'authz.out_of_scope';$a$, '2',
  $a$  membership_row public.workspace_memberships%rowtype;
$a$, '', '1',
  $a$
    if not membership_row.all_locations and not exists (
      select 1 from public.membership_location_scopes scope
      where scope.workspace_id = target_workspace_id
        and scope.membership_id = membership_row.id
        and scope.location_id = scoped_location_id
    ) then
      raise exception 'notification location scope access denied' using errcode = '42501';
    end if;$a$,
  '', '1'
]);

select pg_temp.patch('public.reset_notification_policies_service(uuid,uuid,text,text,text)', array[
  $a$  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write') then
    raise exception 'notification settings write access required' using errcode = '42501';
  end if;
  select * into membership_row
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';
  if membership_row.id is null or not membership_row.all_locations then
    raise exception 'organization-wide notification scope required' using errcode = '42501';
  end if;$a$,
  $a$  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.notifications.write');$a$, '1',
  $a$  membership_row public.workspace_memberships%rowtype;
$a$, '', '1'
]);

select pg_temp.patch('public.preview_notification_policy_service(uuid,uuid,text,text,uuid)', array[
  $a$  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.test_send') then
    raise exception 'notification test-send access required' using errcode = '42501';
  end if;$a$,
  $a$  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.notifications.test');$a$, '1',
  $a$    raise exception 'notification preview recipient must be current actor' using errcode = '42501';$a$,
  $a$    raise exception 'notification preview recipient must be current actor' using errcode = '42501', hint = 'authz.out_of_scope';$a$, '1'
]);

-- 4. The RLS helper behind the browser's catalog writes and a few reads
-- (locations, jobs, departments, shift types and labels, scheduling settings,
-- workspaces, roles, entitlements, the logo bucket). It keeps its permission
-- keys until those policies go with BL-232; who holds a key is the core's
-- answer now, and a closed workspace says no.
create or replace function app_private.workspace_has_permission(target_workspace_id uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select state.status = 'active' and state.workspace_open and not state.document_blocked
      and target_permission = any (state.permissions)
    from app_private.actor((select auth.uid()), target_workspace_id) state
  ), false);
$$;
