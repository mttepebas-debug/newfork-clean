-- Notification panel, slice 2, people (KARARLAR S-247 (3), Mert 2026-10-23): when a request closes, every card
-- it opened is updated for whoever got it (the outcome and who did it, never deleted); read state stays each
-- person's own. Two people requests never closed their cards:
--   * leaving onboarding (leave_employee_onboarding_service): the reviewers' "ready for review" cards
--     (people.onboarding_review_needed, subject onboarding_case) and the person's own "needs a change" cards
--     (people.onboarding_change_requested, subject onboarding_changes) stayed open on a cancelled case; they
--     now close as Withdrawn, closed by the person who left;
--   * an ownership transfer nobody answered in time (people.ownership_transfer_requested): answering it late
--     raises transfer.expired and rolls its own changes back, and nothing sweeps, so the asked card stayed open
--     for good. It now closes as Expired, by nobody, when either side next lists their workspaces
--     (list_my_workspaces_service: the card's own link, /account/workspaces, and the page the sender cancels
--     it from). The transfer row is left as it was (pending until its sender cancels it).
-- An answer or a cancel already closed the transfer card (ownership_tell); a cancel after it expired leaves the
-- Expired card as it is. Both functions keep their signature, language, security definer and search_path;
-- grants are untouched (create or replace). No new function, table, column or cron job.

CREATE OR REPLACE FUNCTION "public"."leave_employee_onboarding_service"("target_user_id" "uuid", "expected_revision" integer, "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  target_membership public.workspace_memberships%rowtype;
begin
  perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  if target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = 'PT409', hint = 'onboarding.changed';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.id = target_case.membership_id
    and membership.workspace_id = target_case.workspace_id
    and membership.user_id = target_user_id
  for update;

  if target_membership.id is null then
    raise exception 'workspace membership unavailable' using errcode = 'P0002';
  end if;
  if target_membership.status = 'active'::public.membership_status then
    raise exception 'active employees cannot leave onboarding' using errcode = '23514';
  end if;
  if target_membership.status <> 'pending_activation'::public.membership_status then
    raise exception 'pending onboarding membership required' using errcode = '23514';
  end if;
  if target_case.status = 'approved'::public.employee_onboarding_case_status then
    raise exception 'approved onboarding cannot be cancelled' using errcode = '22023';
  end if;

  perform set_config('app.workspace_closure', 'on', true);

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status,
      updated_at = now()
  where id = target_membership.id
    and workspace_id = target_case.workspace_id;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.left', 'onboarding_case', target_case.id::text
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_case.workspace_id, target_user_id, 'employee_onboarding.left',
    'workspace_membership', target_membership.id::text,
    jsonb_build_object('employee_id', target_case.employee_id, 'case_id', target_case.id)
  );

  -- S-247: the cards this onboarding opened close as Withdrawn for everyone who got one (the reviewers'
  -- "ready for review", the person's own "needs a change"), the person who left as who closed them. Guarded
  -- like every people notice: a failure is logged and the leaving stands.
  begin
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'withdrawn', target_user_id);
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_changes', target_case.id, 'withdrawn', target_user_id);
  exception when others then
    raise warning 'leave_employee_onboarding: cards for % not closed: % (%)', target_case.id, sqlerrm, sqlstate;
  end;

  return jsonb_build_object(
    'status', 'left',
    'workspace_id', target_case.workspace_id,
    'employee_id', target_case.employee_id,
    'membership_id', target_membership.id,
    'revision', target_case.revision
  );
end;
$$;


CREATE OR REPLACE FUNCTION "public"."list_my_workspaces_service"("actor_user_id" "uuid") RETURNS TABLE("workspace_id" "uuid", "workspace_name" "text", "workspace_role" "public"."workspace_role", "membership_status" "public"."membership_status", "is_active" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "workspace_lifecycle_status" "public"."workspace_lifecycle_status", "closure_effective_at" timestamp with time zone, "last_used_at" timestamp with time zone, "access_removed" boolean, "pending_ownership_transfer_id" "uuid", "pending_ownership_transfer_role" "text", "pending_ownership_transfer_expires_at" timestamp with time zone, "other_member_count" integer, "pending_invitation_count" integer, "default_closure_effective_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  -- S-247: an ownership transfer nobody answered in time closes its "asked" card as Expired the next time
  -- either side lists their workspaces (the card links here; answering it late rolls back, and the transfer
  -- itself stays pending so its sender can cancel it). Nobody closed it: no resolved_by, nobody's read state
  -- moves. Guarded: a failure is logged and the list still comes back.
  begin
    perform app_private.notification_resolve(transfer.workspace_id, 'ownership_transfer', transfer.id, 'expired', null)
    from public.workspace_ownership_transfers transfer
    where transfer.status = 'pending'
      and transfer.expires_at <= now()
      and (transfer.initiated_by = actor_user_id or transfer.target_user_id = actor_user_id)
      and exists (
        select 1 from public.person_notifications card
        where card.workspace_id = transfer.workspace_id and card.subject_type = 'ownership_transfer'
          and card.subject_id = transfer.id and card.resolved_at is null
      );
  exception when others then
    raise warning 'list_my_workspaces: expired transfer cards not closed: % (%)', sqlerrm, sqlstate;
  end;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return query select * from public.list_my_workspaces();
end;
$$;
