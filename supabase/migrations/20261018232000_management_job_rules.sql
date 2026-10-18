-- ROL-CIFT 1.3: Management job rules (KARARLAR S-168; design §4.13).
--
--   * A job leaves Management (archived, deleted, or moved to another department) only if Management
--     keeps a job a manager or admin can hold, and only if nobody's one Management job is that job.
--     Otherwise 22023 + jobs.last_management_job, with the people it would leave without one named in
--     the detail ({"people": ["Mona Person", ...]}). When it may leave, the holders who have another
--     Management job simply lose this one.
--     A move to another department is handled like an archive rather than refused outright: the job is
--     no Management job any more, so it can no longer be anybody's management position (design §4.13:
--     "a management job is a Management department job"), and refusing every move would make an owner
--     unassign everybody first even when they hold other Management jobs. The one thing a move may not
--     do is leave somebody, or Management itself, without one; that is refused by name like an archive.
--   * Setup's function gives the owner's membership the Owner job on the management side.
--   * The Owner job follows the owner: whoever becomes owner holds it; an owner who stops being one
--     loses it and, left with no Management job, gets General Manager (else the first live one).
--   * A hard delete of a job (only the setup reset does that, before anybody holds one) takes its rows.
--
-- Riskli canlı migration (CREATE OR REPLACE of existing functions, a new jobs guard): goes live with the
-- rest of slice 1.

alter table public.membership_management_jobs
  drop constraint membership_management_jobs_job_fkey,
  add constraint membership_management_jobs_job_fkey foreign key (job_id, workspace_id)
    references public.jobs(id, workspace_id) on delete cascade;

-- The display name a refusal names somebody by.
create function app_private.membership_display_name(target_membership uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(btrim(p.preferred_name), ''), p.first_name) || ' ' || p.last_name
     from public.workspace_memberships m
     join public.employee_profiles p on p.workspace_id = m.workspace_id and p.user_id = m.user_id
     where m.id = target_membership
     order by p.archived_at nulls first
     limit 1),
    (select u.email from public.workspace_memberships m join auth.users u on u.id = m.user_id
     where m.id = target_membership)
  );
$$;
revoke all on function app_private.membership_display_name(uuid) from public, anon, authenticated;

create function app_private.management_job_stays_held()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  leaving boolean;
  stranded text[];
begin
  leaving := old.system_key is null
    and old.archived_at is null and old.deleted_at is null
    and exists (select 1 from public.departments d where d.id = old.department_id and d.system_key = 'management')
    and (tg_op = 'DELETE'
         or new.archived_at is not null or new.deleted_at is not null
         or not exists (select 1 from public.departments d where d.id = new.department_id and d.system_key = 'management'));
  if not leaving then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- ponytail: the setup reset deletes every job of an unfinished workspace at once; nobody but the owner
  -- holds one there, and the reset starts setup over.
  if tg_op = 'DELETE' then
    return old;
  end if;

  select coalesce(array_agg(app_private.membership_display_name(mj.membership_id)
                           order by app_private.membership_display_name(mj.membership_id)), '{}')
    into stranded
  from public.membership_management_jobs mj
  where mj.job_id = old.id
    and not exists (select 1 from public.membership_management_jobs other
                    where other.membership_id = mj.membership_id and other.job_id <> old.id);

  if cardinality(stranded) > 0 or not exists (
    select 1 from public.jobs j
    join public.departments d on d.id = j.department_id and d.system_key = 'management'
    where j.workspace_id = old.workspace_id and j.id <> old.id
      and j.archived_at is null and j.deleted_at is null and j.system_key is null
  ) then
    raise exception 'Management keeps at least one job, and everybody with management access keeps one'
      using errcode = '22023', hint = 'jobs.last_management_job',
            detail = jsonb_build_object('people', to_jsonb(stranded))::text;
  end if;

  delete from public.membership_management_jobs where job_id = old.id;
  return new;
end;
$$;
revoke all on function app_private.management_job_stays_held() from public, anon, authenticated;

create trigger management_job_stays_held
  before update of department_id, archived_at, deleted_at on public.jobs
  for each row execute function app_private.management_job_stays_held();

create or replace function app_private.ensure_management_and_owner(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  management uuid;
begin
  insert into public.departments (workspace_id, name, system_key)
  values (target_workspace_id, 'Management', 'management')
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
  select d.id into management from public.departments d
  where d.workspace_id = target_workspace_id and d.system_key = 'management';

  if not exists (
    select 1 from public.jobs j
    where j.workspace_id = target_workspace_id and j.department_id = management
      and j.system_key is null
  ) then
    insert into public.jobs (workspace_id, name, department_id)
    values (target_workspace_id, 'General Manager', management),
           (target_workspace_id, 'Assistant Manager', management)
    on conflict (workspace_id, lower(name)) where archived_at is null do nothing;
  end if;

  insert into public.jobs (workspace_id, name, department_id, system_key)
  values (target_workspace_id, 'Owner', management, 'owner')
  on conflict (workspace_id, system_key) where system_key is not null do nothing;

  -- The owner holds the Owner job on the management side (design §4.2).
  insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
  select target_workspace_id, m.id, j.id
  from public.workspace_memberships m
  join public.jobs j on j.workspace_id = m.workspace_id and j.system_key = 'owner'
  where m.workspace_id = target_workspace_id and app_private.role_class(m.role_id) = 'owner'
  on conflict (membership_id, job_id) do nothing;
end;
$$;

-- The management slot's rows follow it; the Owner job follows the owner.
create or replace function app_private.membership_slot_rows_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_class public.workspace_role := (select r.access_class from public.workspace_roles r where r.id = new.role_id);
  was_class public.workspace_role := (select r.access_class from public.workspace_roles r where r.id = old.role_id);
begin
  if slot_class is distinct from 'manager' then
    delete from public.membership_managed_locations where membership_id = new.id;
  end if;
  if slot_class is null then
    delete from public.membership_management_jobs where membership_id = new.id;
    return null;
  end if;

  if slot_class = 'owner' and was_class is distinct from 'owner' then
    insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
    select new.workspace_id, new.id, j.id from public.jobs j
    where j.workspace_id = new.workspace_id and j.system_key = 'owner'
    on conflict (membership_id, job_id) do nothing;
  elsif slot_class <> 'owner' then
    delete from public.membership_management_jobs mj
    using public.jobs j
    where mj.membership_id = new.id and j.id = mj.job_id and j.system_key = 'owner';
    -- An owner who hands the workspace over keeps a Management job (KARARLAR S-168).
    if was_class = 'owner' and not exists (
      select 1 from public.membership_management_jobs mj where mj.membership_id = new.id
    ) then
      insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
      select new.workspace_id, new.id, j.id
      from public.jobs j
      join public.departments d on d.id = j.department_id and d.system_key = 'management'
      where j.workspace_id = new.workspace_id and j.archived_at is null and j.deleted_at is null
        and j.system_key is null
      order by (lower(j.name) = 'general manager') desc, lower(j.name)
      limit 1;
    end if;
  end if;
  return null;
end;
$$;

-- Setup starts over only while nobody but the owner holds a Management job.
CREATE OR REPLACE FUNCTION "public"."reset_owner_onboarding_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  onboarding_status public.onboarding_status;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status = 'complete'::public.onboarding_status then
    raise exception 'completed owner onboarding cannot be reset' using errcode = '22023';
  end if;
  -- The reset deletes every job; a Management job somebody other than the owner holds would go with it
  -- and leave them without one (KARARLAR S-168, ROL-CIFT 1.3).
  if exists (
    select 1 from public.membership_management_jobs held
    join public.workspace_memberships membership on membership.id = held.membership_id
    join public.workspace_roles role on role.id = membership.role_id
    where held.workspace_id = target_workspace_id and role.access_class <> 'owner'
  ) then
    raise exception 'somebody besides the owner holds a Management job; setup cannot start over'
      using errcode = '22023', hint = 'onboarding.reset_management_jobs_held';
  end if;

  delete from public.employee_profiles
  where workspace_id = target_workspace_id
    and user_id is null;

  delete from public.jobs
  where workspace_id = target_workspace_id;

  delete from public.departments
  where workspace_id = target_workspace_id;

  delete from public.locations
  where workspace_id = target_workspace_id;

  update public.workspace_onboarding
  set status = 'incomplete'::public.onboarding_status,
      current_step = 1,
      completed_at = null,
      updated_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    target_workspace_id,
    actor_user_id,
    'workspace.onboarding_reset',
    'workspace',
    target_workspace_id::text
  );
end;
$$;
