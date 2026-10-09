-- JOIN-013: the owner's record was opened to every location and job that setup
-- created, and then never again. A location or a job added a week later left
-- the one person who can add them unable to be scheduled there, with nothing on
-- screen saying why.
--
-- Everything the owner can work is decided in one place, and new places reach
-- it as they are created.
create or replace function app_private.open_owner_records_to_new_entity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  owner_record record;
begin
  -- An archived location or job is not somewhere anybody works.
  if new.archived_at is not null then
    return new;
  end if;

  for owner_record in
    select employee.id as employee_id, employee.user_id
    from public.employee_profiles employee
    join public.workspace_memberships membership
      on membership.workspace_id = employee.workspace_id
     and membership.user_id = employee.user_id
    where employee.workspace_id = new.workspace_id
      and employee.archived_at is null
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
  loop
    perform app_private.open_owner_record_to_everything(
      new.workspace_id,
      owner_record.employee_id,
      owner_record.user_id
    );
  end loop;

  return new;
end;
$function$;

revoke all on function app_private.open_owner_records_to_new_entity() from public, anon, authenticated;

drop trigger if exists locations_reach_the_owner on public.locations;
create trigger locations_reach_the_owner
after insert on public.locations
for each row execute function app_private.open_owner_records_to_new_entity();

drop trigger if exists jobs_reach_the_owner on public.jobs;
create trigger jobs_reach_the_owner
after insert on public.jobs
for each row execute function app_private.open_owner_records_to_new_entity();

-- Un-archiving is the same event from the record's point of view: the place
-- exists again and the owner can work it again.
drop trigger if exists locations_reach_the_owner_on_restore on public.locations;
create trigger locations_reach_the_owner_on_restore
after update of archived_at on public.locations
for each row
when (old.archived_at is not null and new.archived_at is null)
execute function app_private.open_owner_records_to_new_entity();

drop trigger if exists jobs_reach_the_owner_on_restore on public.jobs;
create trigger jobs_reach_the_owner_on_restore
after update of archived_at on public.jobs
for each row
when (old.archived_at is not null and new.archived_at is null)
execute function app_private.open_owner_records_to_new_entity();
