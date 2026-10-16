-- BILDIRIM-U5 (KARARLAR S-123, S-95, S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.6): documents write their
-- own notices into the new core (part 4, the documents slice).
--   * asked: the person a document is asked of, once per go however many documents (one key per person and
--     transaction); asked again when an exemption is taken back;
--   * sent for review: who may review that person now (documents.review over the person, the core), never a
--     record; a document accepted without review tells nobody, not its sender;
--   * decided: the person once; every reviewer's card closes ("Approved by ...");
--   * the daily check: due at 7, 1 and 0 days, expiring at 30, 7 and 1 days (the person and who may review
--     them now; not while the new one waits for review); each once;
--   * access: restricted when a person's first document is suspended, back when their last suspension
--     lifts, on whatever path (the daily check, a late send, an exemption, a type taken down, a definition
--     applied): a trigger on the suspension itself, so the two always come as a pair; never read from
--     earlier notices;
--   * "documents to complete" belongs to the person and closes when nothing is asked of them any more; a
--     review card closes on the decision, and on an exemption, an unassignment or the type taken down.
-- Every document event already goes through app_private.document_audit; the producer sits there, in the
-- event's own transaction (S-91). The daily part sits in documents_maintain_service's case loop, after
-- 09:00 in the person's time zone, as the old reminders did.

-- Asked, sent for review, decided -------------------------------------------------------------------------

create function app_private.document_tell(r public.employee_onboarding_requirements, actor uuid, event_action text,
  event_metadata jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  person public.employee_profiles%rowtype;
  name text;
  decided text;
  now_row public.employee_onboarding_requirements%rowtype;
  sent integer := 0;
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  -- The row as it is now: an event may be handed the row from before its own change (an owner no longer
  -- excused after a handover is asked again).
  select * into now_row from public.employee_onboarding_requirements x where x.id = r.id;
  if person.user_id is null then
    return 0;
  end if;
  name := btrim(coalesce(nullif(person.preferred_name, ''), person.first_name) || ' ' || person.last_name);

  -- Asked: a document assigned or reopened (on publishing it, or the person coming to match it), or an
  -- exemption taken back.
  if event_action in ('document.assignment_created', 'document.assignment_reopened')
     or (event_action = 'document.definition_applied' and event_metadata ->> 'action' in ('assign', 'reopen'))
     or event_action = 'document.exemption_removed' then
    -- Nothing to do when what was approved before still counts, or the person no longer matches it. An
    -- exemption's row is the one before it was taken back: its event says.
    if now_row.owner_excused
       or (event_action = 'document.exemption_removed'
           and (coalesce((event_metadata ->> 'valid_approved')::boolean, false) or not coalesce((event_metadata ->> 'matching')::boolean, true)))
       or (event_action <> 'document.exemption_removed' and app_private.document_obligation_state(r, now()) not in ('grace', 'missing', 'rejected', 'expired')) then
      return 0;
    end if;
    -- The person's card: it closes when nothing is asked of them (document_tell_settle).
    return app_private.notify('documents.requested', r.workspace_id, array[person.user_id],
      -- One go, one notice: every document asked of the person in one transaction is one event.
      -- Asked again (an exemption taken back, a handover) is its own go, also one notice.
      case when event_action = 'document.exemption_removed' then 'doc_request_again:' else 'doc_request:' end
        || r.employee_id::text || ':' || txid_current()::text,
      'You have documents to complete', 'Open your documents to see what is asked and by when.',
      '/account/documents?workspace=' || r.workspace_id::text, actor, 'employee_documents', r.employee_id,
      jsonb_build_object('requirement_id', r.id, 'title', r.title));
  end if;

  -- Gone from under a waiting review: an exemption, an unassignment, the type taken down. Its cards close.
  if event_action in ('document.exempted', 'document.assignment_removed', 'document.publication_paused')
     or (event_action = 'document.definition_applied' and event_metadata ->> 'action' = 'remove') then
    perform app_private.notification_resolve(r.workspace_id, 'document_requirement', r.id, 'closed', actor);
  end if;

  if event_action = 'document.submitted' and event_metadata ->> 'state' = 'pending_review' then
    -- Accepted without review: nobody to ask, and the sender knows.
    sent := app_private.notify('documents.review_needed', r.workspace_id,
      app_private.notify_holders(r.workspace_id, 'documents.review', null, r.employee_id),
      'doc_review:' || r.id::text || ':' || coalesce(event_metadata ->> 'submission_id', ''),
      name || ' sent ' || r.title || ' for review', null,
      '/app/employees/documents?requirement=' || r.id::text, actor, 'document_requirement', r.id,
      jsonb_build_object('requirement_id', r.id, 'employee_id', r.employee_id));
  end if;

  if event_action in ('document.approve', 'document.reject') then
    decided := case when event_action = 'document.approve' then 'approved' else 'declined' end;
    sent := app_private.notify('documents.decided', r.workspace_id, array[person.user_id],
      'doc_decision:' || r.id::text || ':' || coalesce(event_metadata ->> 'revision', txid_current()::text),
      'Your ' || r.title || case when decided = 'approved' then ' was approved' else ' needs a change' end,
      case when decided = 'declined' then 'Open your documents to see what to change.' end,
      '/account/documents?workspace=' || r.workspace_id::text, actor, 'document_requirement', r.id,
      jsonb_build_object('requirement_id', r.id, 'outcome', decided));
    perform app_private.notification_resolve(r.workspace_id, 'document_requirement', r.id, decided, actor);
  end if;

  -- Nothing asked of the person any more: their "documents to complete" closes.
  if not exists (
    select 1 from public.employee_onboarding_requirements x
    where x.workspace_id = r.workspace_id and x.employee_id = r.employee_id and x.kind in ('document', 'acknowledgement')
      and x.lifecycle_retired_at is null and not x.owner_excused
      and app_private.document_obligation_state(x, now()) in ('grace', 'missing', 'rejected', 'expired')
  ) then
    perform app_private.notification_resolve(r.workspace_id, 'employee_documents', r.employee_id, 'completed', actor);
  end if;
  return sent;
end;
$$;

revoke all on function app_private.document_tell(public.employee_onboarding_requirements, uuid, text, jsonb) from public;

create or replace function app_private.document_audit(r public.employee_onboarding_requirements, actor uuid, event_action text,
  event_metadata jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.onboarding_events(workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (r.workspace_id, r.employee_id, r.case_id, actor, event_action, 'onboarding_requirement', r.id::text,
    event_metadata || case when actor is null then '{"actor_kind":"system"}'::jsonb else '{}'::jsonb end);
  -- The event's notice, in the same transaction (document_tell).
  perform app_private.document_tell(r, actor, event_action, event_metadata);
end;
$$;

-- The daily check ---------------------------------------------------------------------------------------

-- One case, after 09:00 in the person's zone: the due dates (7, 1, 0 days) and the expiry dates (30, 7, 1
-- days). Each milestone once (its key).
create function app_private.document_check_case(target_case uuid, at_time timestamptz)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c public.employee_onboarding_cases%rowtype;
  person public.employee_profiles%rowtype;
  name text;
  u uuid;
  w uuid;
  tz text;
  local_now timestamp;
  q public.employee_onboarding_requirements%rowtype;
  days_left integer;
  milestone integer;
  expiry date;
  approved_on date;
  sent integer := 0;
begin
  select * into c from public.employee_onboarding_cases oc where oc.id = target_case;
  select * into person from public.employee_profiles e where e.id = c.employee_id and e.workspace_id = c.workspace_id;
  u := person.user_id;
  w := c.workspace_id;
  if u is null then
    return 0;
  end if;
  name := btrim(coalesce(nullif(person.preferred_name, ''), person.first_name) || ' ' || person.last_name);

  tz := app_private.document_employee_timezone(w, c.employee_id);
  if tz is null then
    return sent;
  end if;
  local_now := at_time at time zone tz;
  if local_now::time < '09:00'::time then
    return sent;
  end if;

  for q in select x.* from public.employee_onboarding_requirements x
    where x.case_id = c.id and x.lifecycle_user_id = u and x.kind in ('document', 'acknowledgement')
      and x.lifecycle_retired_at is null and x.publication_paused_at is null and not x.lifecycle_exempt
      and x.lifecycle_closed_at is null and x.status <> 'superseded' and x.lifecycle_settings ->> 'mode' <> 'optional'
    order by x.id
  loop
    -- Due: still to do, at 7, 1 and 0 days.
    if q.deadline_at is not null and app_private.document_obligation_state(q, at_time) in ('grace', 'missing', 'rejected') then
      days_left := (q.deadline_at at time zone tz)::date - local_now::date;
      milestone := case when days_left between 2 and 7 then 7 when days_left = 1 then 1 when days_left = 0 then 0 end;
      if milestone is not null then
        sent := sent + app_private.notify('documents.due_soon', w, array[u],
          'doc_due:' || q.id::text || ':' || q.lifecycle_revision::text || ':' || milestone::text,
          'Due ' || case milestone when 0 then 'today' when 1 then 'tomorrow'
                     else to_char((q.deadline_at at time zone tz)::date, 'FMDy, FMMon FMDD') end || ': ' || q.title,
          null, '/account/documents?workspace=' || w::text || '&requirement=' || q.id::text, null, 'document_requirement', q.id,
          jsonb_build_object('requirement_id', q.id, 'days_left', days_left));
      end if;
    end if;
    -- Expiring: an approved document at 30, 7 and 1 days, not one approved inside the window.
    -- A new one waiting for review is the renewal: no "upload the new one".
    if q.kind = 'document' and q.approved_document_id is not null
       and not exists (select 1 from public.employee_document_submissions s
                       where s.id = q.submitted_document_id and s.state = 'pending_review') then
      select s.expiry_date, (s.reviewed_at at time zone tz)::date into expiry, approved_on
      from public.employee_document_submissions s where s.id = q.approved_document_id and s.state = 'accepted';
      days_left := expiry - local_now::date;
      milestone := case when days_left = 1 then 1 when days_left between 2 and 7 then 7 when days_left between 8 and 30 then 30 end;
      if milestone is not null and not (approved_on > expiry - milestone) then
        sent := sent + app_private.notify('documents.expiring', w, array[u],
          'doc_expiry:' || q.approved_document_id::text || ':' || milestone::text,
          'Your ' || q.title || ' expires in ' || days_left || case when days_left = 1 then ' day' else ' days' end,
          'Upload the new one before it does.', '/account/documents?workspace=' || w::text || '&requirement=' || q.id::text,
          null, 'document_requirement', q.id, jsonb_build_object('requirement_id', q.id, 'days_left', days_left));
        -- Who may review the person now hears it too (the core, not a record).
        sent := sent + app_private.notify('documents.expiring', w,
          array(select x from unnest(app_private.notify_holders(w, 'documents.review', null, c.employee_id)) x where x <> u),
          'doc_expiry:' || q.approved_document_id::text || ':' || milestone::text,
          name || '''s ' || q.title || ' expires in ' || days_left || case when days_left = 1 then ' day' else ' days' end,
          null, '/app/employees/documents?requirement=' || q.id::text,
          null, 'document_requirement', q.id, jsonb_build_object('requirement_id', q.id, 'days_left', days_left));
      end if;
    end if;
  end loop;
  return sent;
end;
$$;

revoke all on function app_private.document_check_case(uuid, timestamptz) from public;

-- Access follows the suspension itself (document_suspended_at), on every path that sets or clears it:
-- restricted when a person's first document is suspended, back when their last one is cleared. A trigger,
-- because those paths are many (the daily check, a late send, a review, an exemption, a type taken down,
-- a definition applied) and some hand on only the row after their change.
create function app_private.document_access_told()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  place text;
begin
  select e.user_id into person from public.employee_profiles e where e.id = new.employee_id and e.workspace_id = new.workspace_id;
  if person is null then
    return null;
  end if;
  if old.document_suspended_at is null and new.document_suspended_at is not null then
    -- Already restricted by an earlier suspension: nothing new to tell.
    if exists (select 1 from public.employee_onboarding_requirements x
               where x.workspace_id = new.workspace_id and x.employee_id = new.employee_id and x.id <> new.id
                 and x.document_suspended_at < new.document_suspended_at) then
      return null;
    end if;
    select w.name into place from public.workspaces w where w.id = new.workspace_id;
    perform app_private.notify('documents.access_changed', new.workspace_id, array[person],
      'doc_access:' || new.employee_id::text || ':restricted:' || new.document_suspended_at::text,
      'Upload your documents to use ' || place || ' again', 'A required document is past its due date.',
      '/account/documents?workspace=' || new.workspace_id::text, null, 'employee_documents', new.employee_id,
      jsonb_build_object('state', 'restricted'));
  elsif old.document_suspended_at is not null and new.document_suspended_at is null then
    -- Another document is still suspended: still restricted.
    if exists (select 1 from public.employee_onboarding_requirements x
               where x.workspace_id = new.workspace_id and x.employee_id = new.employee_id
                 and x.document_suspended_at is not null) then
      return null;
    end if;
    perform app_private.notify('documents.access_changed', new.workspace_id, array[person],
      'doc_access:' || new.employee_id::text || ':restored:' || txid_current()::text,
      'Your access is back', 'Your documents are in order.',
      '/account/documents?workspace=' || new.workspace_id::text, null, 'employee_documents', new.employee_id,
      jsonb_build_object('state', 'restored'));
  end if;
  return null;
end;
$$;

revoke all on function app_private.document_access_told() from public;

create trigger document_access_told
after update of document_suspended_at on public.employee_onboarding_requirements
for each row when (old.document_suspended_at is distinct from new.document_suspended_at)
execute function app_private.document_access_told();

create or replace function public.documents_maintain_service(target_batch_size integer default 100, at_time timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare c public.employee_onboarding_cases%rowtype; checked integer:=0; suspended integer;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 -- The restriction first, for every case and on its own.
 suspended:=app_private.document_suspend_overdue();
 -- A batch of cases at a time, oldest checked first.
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
  -- Its notices (document_check_case); a case that fails is named and the batch goes on.
  -- ponytail: one subtransaction per case; past 64 in one transaction Postgres keeps their ids beside the
  -- cache, a little slower, never wrong. The cron sends 100; drop it below 64 if a check ever shows it.
  begin
   perform app_private.document_check_case(c.id, at_time);
  exception when others then
   raise warning 'documents_maintain_service: case % skipped: % (%)', c.id, sqlerrm, sqlstate;
  end;
 end loop;
 return jsonb_build_object('checked',checked,'suspended',suspended);
end;
$$;
