-- FOUNDATION-B stage 1b: security stopgaps that need no product decision.
--
-- 1. The browser keeps only the doors it uses. The web app writes directly to
--    user_profiles, user_preferences and the seven Settings > Organization
--    tables (workspaces name/logo, locations, departments, jobs,
--    important_dates, shift_types, shift_labels). Every other write grant to
--    anon/authenticated was unused and let a browser do what the API refuses:
--    an admin could re-point another member's membership to any account, add
--    a manager scope row outside the assignment rule, mark the workspace
--    deleted or switch Shift Hub on; any employee could insert a backdated
--    audit row. Those grants go. TRUNCATE, REFERENCES, TRIGGER and MAINTAIN
--    go everywhere: no role but the owner should ever hold them, and the
--    public schema's default privileges handed them to every new table.
-- 2. No function starts out executable by PUBLIC. The 2026-09-08 revoke was
--    written per schema, and Postgres cannot take a global default away per
--    schema, so every new function in public and app_private was still
--    callable by everyone until its migration revoked it by hand; three
--    app_private definer functions trust a caller-supplied user id. The
--    default is now revoked for everything postgres creates, and nothing in
--    app_private keeps PUBLIC execute. Explicit grants (the eight RLS helpers
--    for authenticated, service_role) are untouched, and trigger functions do
--    not need EXECUTE at fire time.
-- 3. Every tenant link names its tenant. The last eleven single-column foreign
--    keys between tenant-owned tables become composite with workspace_id, so a
--    row can no longer point at another workspace's row.
-- 4. The membership's role class has one source: a composite key ties
--    workspace_memberships.role to its role's access_class.
-- 5. Saving an employee no longer wipes the approved preferred name (BL-098).

-- 1. Browser grants --------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger, maintain
  on public.workspace_memberships,
     public.membership_location_scopes,
     public.audit_events,
     public.workspace_onboarding,
     public.workspace_scheduling_settings,
     public.user_workspace_preferences,
     public.employee_onboarding_settings
  from anon, authenticated;

revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
revoke update on all sequences in schema public from anon, authenticated;

revoke insert, update on public.workspaces from anon, authenticated;
grant update (
  name,
  logo_storage_path,
  logo_file_name,
  logo_updated_at,
  schedule_logo_scale,
  schedule_logo_offset_x,
  schedule_logo_offset_y,
  updated_at
) on public.workspaces to authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke update on sequences from anon, authenticated;

-- The bootstrap branch compared existing.workspace_id with itself and could
-- never be true once a membership existed; with INSERT revoked the policy is
-- unreachable anyway.
drop policy if exists memberships_insert_bootstrap_or_manager on public.workspace_memberships;

-- 2. app_private execute ------------------------------------------------------

alter default privileges for role postgres revoke execute on functions from public;
revoke execute on all functions in schema app_private from public;

-- 3. Tenant links -------------------------------------------------------------

alter table public.schedule_lineup_snapshots
  add constraint schedule_lineup_snapshots_id_workspace_id_key unique (id, workspace_id);
alter table public.weekly_preference_events
  add constraint weekly_preference_events_id_workspace_id_key unique (id, workspace_id);
alter table public.time_off_cancellation_links
  add constraint time_off_cancellation_links_request_id_workspace_id_key unique (request_id, workspace_id);

alter table public.workspace_memberships
  drop constraint workspace_memberships_employee_id_fkey,
  add constraint workspace_memberships_employee_id_fkey
    foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id)
    on delete set null (employee_id);

alter table public.employee_onboarding_requirements
  drop constraint requirement_approved_document,
  add constraint requirement_approved_document
    foreign key (approved_document_id, id, workspace_id, employee_id)
    references public.employee_document_submissions(id, requirement_id, workspace_id, employee_id)
    deferrable initially deferred,
  drop constraint requirement_submitted_document,
  add constraint requirement_submitted_document
    foreign key (submitted_document_id, id, workspace_id, employee_id)
    references public.employee_document_submissions(id, requirement_id, workspace_id, employee_id)
    deferrable initially deferred;

alter table public.lineup_receipts
  drop constraint lineup_receipts_snapshot_id_fkey,
  add constraint lineup_receipts_snapshot_id_fkey
    foreign key (snapshot_id, workspace_id) references public.schedule_lineup_snapshots(id, workspace_id)
    on delete cascade;

alter table public.lineup_notification_outbox
  drop constraint lineup_notification_outbox_snapshot_id_fkey,
  add constraint lineup_notification_outbox_snapshot_id_fkey
    foreign key (snapshot_id, workspace_id) references public.schedule_lineup_snapshots(id, workspace_id);

alter table public.employee_create_commands
  drop constraint employee_create_commands_employee_id_fkey,
  add constraint employee_create_commands_employee_id_fkey
    foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id)
    on delete cascade,
  drop constraint employee_create_commands_invitation_id_fkey,
  add constraint employee_create_commands_invitation_id_fkey
    foreign key (invitation_id, workspace_id) references public.employee_invitations(id, workspace_id)
    on delete set null (invitation_id);

alter table public.time_off_cancellation_periods
  drop constraint time_off_cancellation_periods_request_id_fkey,
  add constraint time_off_cancellation_periods_request_id_fkey
    foreign key (request_id, workspace_id) references public.time_off_cancellation_links(request_id, workspace_id);

alter table public.weekly_preference_commitment_decisions
  drop constraint weekly_preference_commitment_decisions_event_id_fkey,
  add constraint weekly_preference_commitment_decisions_event_id_fkey
    foreign key (event_id, workspace_id) references public.weekly_preference_events(id, workspace_id);

alter table public.schedule_shift_batch_commands
  drop constraint schedule_shift_batch_commands_session_id_fkey,
  add constraint schedule_shift_batch_commands_session_id_fkey
    foreign key (session_id, workspace_id) references public.schedule_edit_sessions(id, workspace_id)
    on delete cascade;

alter table public.employee_preferred_name_requests
  drop constraint employee_preferred_name_requests_employee_id_fkey,
  add constraint employee_preferred_name_requests_employee_id_fkey
    foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id)
    on delete cascade;

-- 4. One source for the role class ---------------------------------------------

alter table public.workspace_roles
  add constraint workspace_roles_id_workspace_id_access_class_key unique (id, workspace_id, access_class);

alter table public.workspace_memberships
  drop constraint workspace_memberships_role_fk,
  add constraint workspace_memberships_role_fk
    foreign key (role_id, workspace_id, role)
    references public.workspace_roles(id, workspace_id, access_class)
    on update cascade on delete restrict;

-- 5. BL-098: keep the approved preferred name -----------------------------------
-- The preferred name changes only through request_employee_preferred_name_service
-- and its decision; saving the rest of the record keeps whatever is stored.

create or replace function public.save_employee_service(
  actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid,
  employee_first_name text, employee_middle_name text, employee_last_name text,
  employee_preferred_name text, employee_invitation_email text, employee_start_date date,
  employee_internal_note text, location_ids uuid[], primary_location_id uuid,
  job_ids uuid[], primary_job_id uuid, employee_is_remote boolean,
  employee_is_excluded_from_schedule boolean, expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_employee(
    target_workspace_id,
    target_employee_id,
    employee_first_name,
    employee_middle_name,
    employee_last_name,
    coalesce((
      select e.preferred_name from public.employee_profiles e
      where e.id = target_employee_id and e.workspace_id = target_workspace_id
    ), ''),
    employee_invitation_email,
    employee_start_date,
    employee_internal_note,
    location_ids,
    primary_location_id,
    job_ids,
    primary_job_id,
    employee_is_remote,
    employee_is_excluded_from_schedule,
    expected_revision
  );
end;
$function$;
