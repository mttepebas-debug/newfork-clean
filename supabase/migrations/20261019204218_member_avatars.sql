-- AVATAR-IKON 3.1: one avatar per workspace membership and a last avatar that points at its source
-- (design §4.3-4.5, §4.7). This part only adds and replaces, so the web and API served today keep
-- working; the old avatar fields, services and policies go in part B, retire_old_avatar_paths,
-- live only after the new web and API are served (design §6 "Silinecekler").
--
-- A person's avatar belongs to their membership, not to an employee record: somebody who only manages
-- has one too. It is a photo they uploaded into the workspace's private employee-profile-photos bucket
-- or a drawing from the Lineup archive, never both. The account keeps no copy: app_private.last_avatars
-- names the drawing, or the membership whose photo it was, so a photo a manager removed is never
-- offered again. Nothing here is for the browser; the API calls the services as service_role.

-- The avatar ----------------------------------------------------------------------------------------

create table public.member_avatars (
  membership_id uuid primary key,
  workspace_id uuid not null,
  photo_path text,
  art_key text,
  updated_at timestamptz not null default now(),
  -- A membership row is never deleted today (ROL-CIFT slice 4: offboarding suspends it); if one is,
  -- its avatar goes with it.
  constraint member_avatars_membership_fkey foreign key (membership_id, workspace_id)
    references public.workspace_memberships (id, workspace_id) on delete cascade,
  constraint member_avatars_art_fkey foreign key (art_key) references app_private.lineup_art (key),
  constraint member_avatars_one_of_two check (num_nonnulls(photo_path, art_key) = 1),
  constraint member_avatars_photo_path_shape check (
    photo_path is null
    or photo_path ~ ('^' || workspace_id::text || '/' || membership_id::text
                     || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'))
);

alter table public.member_avatars enable row level security;
revoke all on public.member_avatars from anon, authenticated;

comment on table public.member_avatars is
  'A person''s avatar in one workspace (AVATAR-IKON): a photo they uploaded or a Lineup archive drawing, never both. Read and written only through the avatar services.';
comment on column public.member_avatars.photo_path is
  'Object path in the private employee-profile-photos bucket: <workspace_id>/<membership_id>/<uuid>.<jpg|png|webp>.';
comment on column public.member_avatars.art_key is
  'A Lineup archive drawing (app_private.lineup_art).';

-- The last avatar: where the account's most recent avatar came from -------------------------------------

create table app_private.last_avatars (
  user_id uuid primary key,
  source_membership_id uuid,
  art_key text,
  constraint last_avatars_user_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  -- The membership whose avatar it was; a drawing outlives it, a photo does not.
  constraint last_avatars_source_membership_fkey foreign key (source_membership_id)
    references public.workspace_memberships (id) on delete set null,
  constraint last_avatars_art_fkey foreign key (art_key) references app_private.lineup_art (key)
);

create index last_avatars_source_membership_idx on app_private.last_avatars (source_membership_id);

alter table app_private.last_avatars enable row level security;
revoke all on app_private.last_avatars from public, anon, authenticated;

comment on table app_private.last_avatars is
  'An account''s last avatar (AVATAR-IKON), offered when it joins another workspace: a drawing''s key, or (art_key null) the membership whose current photo it is. Never a copy of the photo.';

-- One's own avatar is one's own action, also while onboarding is not finished.
insert into app_private.authz_actions (key, scope_class, effect, restricted_ok)
values ('avatar.self', 'own', 'write', true);

-- Clearing one membership's avatar: the one place that deletes it ------------------------------------

-- Deletes the membership's avatar and every last avatar that points at that membership, and hands back
-- the photo's path (null for a drawing or no avatar) for the caller to delete from storage. It asks
-- nobody: its callers authorize first. Not callable by any API role, only by other postgres-owned
-- SECURITY DEFINER functions (S-187: removing a person's access to a workspace deletes that avatar).
create function app_private.clear_member_avatar(target_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_photo text;
begin
  delete from public.member_avatars a
  where a.membership_id = target_membership_id
  returning a.photo_path into removed_photo;

  delete from app_private.last_avatars l where l.source_membership_id = target_membership_id;

  return removed_photo;
end;
$$;

alter function app_private.clear_member_avatar(uuid) owner to postgres;
revoke all on function app_private.clear_member_avatar(uuid) from public, anon, authenticated, service_role;
comment on function app_private.clear_member_avatar(uuid) is
  'Deletes a membership''s avatar (public.member_avatars) and every app_private.last_avatars row whose source is that membership; returns the removed photo_path, null for a drawing or no avatar (AVATAR-IKON, S-187). Does not authorize: the caller authorizes first. Callers: remove_own_avatar_service, remove_member_photo_service and, when a person''s access to a workspace is removed, public.remove_employee_access_service (ROL-CIFT). The caller must delete the returned object from the employee-profile-photos bucket.';

-- The services --------------------------------------------------------------------------------------

-- One's own avatar here, and the drawings one's jobs here suggest: every job's Lineup icons, the
-- primary job's first, each once.
create function public.get_own_avatar_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership uuid;
  avatar public.member_avatars;
  suggested text[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'avatar.self');

  select m.id into membership
  from public.workspace_memberships m
  where m.workspace_id = target_workspace_id and m.user_id = actor_user_id;

  select * into avatar from public.member_avatars a where a.membership_id = membership;

  select coalesce(array_agg(ranked.icon order by ranked.first_seen), '{}') into suggested
  from (
    select listed.icon, min(listed.position) as first_seen
    from (
      select icon.key as icon,
        row_number() over (order by assignment.is_primary desc, job.name, job.id, icon.n) as position
      from public.employee_profiles profile
      join public.employee_job_assignments assignment
        on assignment.employee_id = profile.id and assignment.workspace_id = profile.workspace_id
       and assignment.ended_at is null
      join public.jobs job
        on job.id = assignment.job_id and job.workspace_id = assignment.workspace_id and job.archived_at is null
      cross join unnest(job.lineup_icons) with ordinality as icon (key, n)
      where profile.workspace_id = target_workspace_id
        and profile.user_id = actor_user_id
        and profile.archived_at is null
    ) listed
    group by listed.icon
  ) ranked;

  return jsonb_build_object(
    'kind', case when avatar.photo_path is not null then 'photo' when avatar.art_key is not null then 'art' end,
    'art_key', avatar.art_key,
    'photo_path', avatar.photo_path,
    'suggested', to_jsonb(suggested));
end;
$$;

-- Saves one's own avatar here: {"art_key": k} or {"photo_path": p}, p in one's own membership's place.
-- It becomes the account's last avatar. Hands back the photo it replaced, for the API to delete.
create function public.save_own_avatar_service(actor_user_id uuid, target_workspace_id uuid, choice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership uuid;
  chosen_art text := choice ->> 'art_key';
  chosen_photo text := choice ->> 'photo_path';
  previous text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'avatar.self');

  select m.id into membership
  from public.workspace_memberships m
  where m.workspace_id = target_workspace_id and m.user_id = actor_user_id;

  if chosen_photo is not null
     and not starts_with(chosen_photo, target_workspace_id::text || '/' || membership::text || '/') then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'avatar.self';
  end if;

  select a.photo_path into previous
  from public.member_avatars a
  where a.membership_id = membership
  for update;

  insert into public.member_avatars (membership_id, workspace_id, photo_path, art_key, updated_at)
  values (membership, target_workspace_id, chosen_photo, chosen_art, now())
  on conflict (membership_id) do update
  set photo_path = excluded.photo_path, art_key = excluded.art_key, updated_at = excluded.updated_at;

  insert into app_private.last_avatars (user_id, source_membership_id, art_key)
  values (actor_user_id, membership, chosen_art)
  on conflict (user_id) do update
  set source_membership_id = excluded.source_membership_id, art_key = excluded.art_key;

  return jsonb_build_object('previous_photo_path',
    case when previous is distinct from chosen_photo then previous end);
end;
$$;

-- Removes one's own avatar here; a last avatar that pointed at it goes too.
create function public.remove_own_avatar_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership uuid;
  previous text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'avatar.self');

  select m.id into membership
  from public.workspace_memberships m
  where m.workspace_id = target_workspace_id and m.user_id = actor_user_id;

  previous := app_private.clear_member_avatar(membership);

  return jsonb_build_object('previous_photo_path', previous);
end;
$$;

-- The account's last avatar, offered in this workspace: a drawing by its key, a photo by where it is
-- now. Nothing when it came from here, when the photo it pointed at is gone, or when its source is no
-- longer live: a membership that is neither active nor still onboarding (suspended, say), or a workspace
-- that is closed to the person (the same test the authorization core makes, workspace_open_to_actor).
create function public.get_last_avatar_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership uuid;
  remembered app_private.last_avatars;
  source_photo text;
  source_name text;
  source_live boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'avatar.self');

  select m.id into membership
  from public.workspace_memberships m
  where m.workspace_id = target_workspace_id and m.user_id = actor_user_id;

  select * into remembered from app_private.last_avatars l where l.user_id = actor_user_id;
  if remembered.user_id is null or remembered.source_membership_id is not distinct from membership then
    return null;
  end if;

  select w.name, a.photo_path,
    m.status in ('active', 'pending_activation') and app_private.workspace_open_to_actor(m.workspace_id, actor_user_id)
    into source_name, source_photo, source_live
  from public.workspace_memberships m
  join public.workspaces w on w.id = m.workspace_id
  left join public.member_avatars a on a.membership_id = m.id
  where m.id = remembered.source_membership_id and m.user_id = actor_user_id;

  -- A drawing whose membership was deleted (source forgotten) is still offered; a known source must be live.
  if remembered.source_membership_id is not null and source_live is not true then
    return null;
  end if;

  if remembered.art_key is not null then
    return jsonb_build_object('kind', 'art', 'art_key', remembered.art_key, 'source_photo_path', null,
      'from_workspace_name', source_name);
  end if;
  if source_photo is null then
    return null;
  end if;
  return jsonb_build_object('kind', 'photo', 'art_key', null, 'source_photo_path', source_photo,
    'from_workspace_name', source_name);
end;
$$;

-- The photo a person uploaded here, for whoever reads their record; a drawing or no avatar is null.
create function public.get_member_avatar_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  photo text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);

  select a.photo_path into photo
  from public.employee_profiles profile
  join public.workspace_memberships m on m.workspace_id = profile.workspace_id and m.user_id = profile.user_id
  join public.member_avatars a on a.membership_id = m.id
  where profile.id = target_employee_id and profile.workspace_id = target_workspace_id;

  return photo;
end;
$$;

-- A manager removes the photo a person uploaded here, never their drawing. The last avatar that pointed
-- at it goes, so it is never offered again. No notification (Mert, design §4.5).
create function public.remove_member_photo_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership uuid;
  photo text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save', target_person => target_employee_id);

  select m.id into membership
  from public.employee_profiles profile
  join public.workspace_memberships m on m.workspace_id = profile.workspace_id and m.user_id = profile.user_id
  where profile.id = target_employee_id and profile.workspace_id = target_workspace_id;

  select a.photo_path into photo
  from public.member_avatars a
  where a.membership_id = membership
  for update;
  if photo is null then
    raise exception 'Not a photo' using errcode = 'PT409', hint = 'avatar.not_photo';
  end if;

  perform app_private.clear_member_avatar(membership);

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.avatar_removed', 'Workspace profile photo removed');

  return photo;
end;
$$;

revoke all on function public.get_own_avatar_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_own_avatar_service(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_own_avatar_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_last_avatar_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_member_avatar_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_member_photo_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_own_avatar_service(uuid, uuid) to service_role;
grant execute on function public.save_own_avatar_service(uuid, uuid, jsonb) to service_role;
grant execute on function public.remove_own_avatar_service(uuid, uuid) to service_role;
grant execute on function public.get_last_avatar_service(uuid, uuid) to service_role;
grant execute on function public.get_member_avatar_service(uuid, uuid, uuid) to service_role;
grant execute on function public.remove_member_photo_service(uuid, uuid, uuid) to service_role;

-- Account deletion --------------------------------------------------------------------------------------

-- The account deletion worker, under its lease, reads where the person's avatar photos are and the folder
-- of every membership they had (<workspace>/<membership>/, whatever its status) in employee-profile-photos,
-- deletes those photos and everything else in those folders (an upload never confirmed, a delete that
-- failed), and only then purges the account (below), which forgets the avatars. A failed storage step stops
-- the purge, so no photo is left that nothing points at.
create function public.list_account_deletion_avatar_objects_service(target_request_id uuid, target_lease_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  photos text[];
  folders text[];
begin
  perform public.renew_account_deletion_work_service(target_request_id, target_lease_id);

  select coalesce(array_agg(a.photo_path order by a.photo_path), '{}') into photos
  from public.account_deletion_requests request
  join public.workspace_memberships m on m.user_id = request.user_id
  join public.member_avatars a on a.membership_id = m.id
  where request.id = target_request_id and a.photo_path is not null;

  select coalesce(array_agg(place.folder order by place.folder), '{}') into folders
  from (
    select m.workspace_id::text || '/' || m.id::text || '/' as folder
    from public.account_deletion_requests request
    join public.workspace_memberships m on m.user_id = request.user_id
    where request.id = target_request_id
  ) place;

  return jsonb_build_object('photos', to_jsonb(photos), 'folders', to_jsonb(folders));
end;
$$;

revoke all on function public.list_account_deletion_avatar_objects_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_account_deletion_avatar_objects_service(uuid, uuid) to service_role;

-- The purge also forgets the person's avatars in every workspace and their last avatar; the memberships
-- themselves stay, as before. Everything else is the body of 20260914130000 unchanged.
create or replace function public.finalize_account_deletion_service(target_request_id uuid, target_now timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.account_deletion_requests%rowtype;
begin
  select * into target_request
  from public.account_deletion_requests request
  where request.id = target_request_id
    and request.status = 'pending'
  for update;
  if target_request.id is null then
    return jsonb_build_object('status', 'completed', 'idempotent', true);
  end if;
  if target_request.restore_until > target_now then
    raise exception 'account deletion restore window remains open' using errcode = '23514';
  end if;

  update public.account_deletion_requests
  set finalization_started_at = coalesce(finalization_started_at, now()),
      updated_at = now()
  where id = target_request.id;

  delete from public.account_deletion_deliveries where request_id = target_request.id;
  delete from public.user_workspace_preferences where user_id = target_request.user_id;
  delete from public.user_preferences where user_id = target_request.user_id;
  delete from public.user_profiles where user_id = target_request.user_id;
  delete from public.member_avatars a
  using public.workspace_memberships m
  where a.membership_id = m.id and m.user_id = target_request.user_id;
  delete from app_private.last_avatars l where l.user_id = target_request.user_id;

  update public.account_deletion_requests
  set status = 'completed',
      typed_email = '<deleted>',
      recovery_token_digest = null,
      completed_at = now(),
      anonymized_at = now(),
      updated_at = now()
  where id = target_request.id;

  perform app_private.record_security_audit_event_service(
    target_request.user_id, null, 'account.deletion_finalized', 'account.security',
    'account_deletion_request', target_request.id::text, '{}'::jsonb
  );

  return jsonb_build_object('status', 'completed', 'idempotent', false);
end;
$$;
