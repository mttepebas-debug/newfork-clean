-- BILDIRIM-U5 (KARARLAR S-123, S-95, S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.6): documents write their
-- own notices into the new core (part 4, the documents slice).
--   * asked: the person a document is asked of, once per go however many documents (one key per person and
--     transaction); asked again when an exemption is taken back;
--   * sent for review: who may review that person now (documents.review over the person, the core), never a
--     record; a document accepted without review tells nobody, not its sender;
--   * decided: the person once; every reviewer's card closes ("Approved by ...");
--   * the daily check: due at 7, 1 and 0 days, expiring at 30, 7 and 1 days (the person and who may review
--     them now), access restricted and back; each once.
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
  sent integer := 0;
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  if person.user_id is null or r.owner_excused then
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
    if (event_action = 'document.exemption_removed'
        and (coalesce((event_metadata ->> 'valid_approved')::boolean, false) or not coalesce((event_metadata ->> 'matching')::boolean, true)))
       or (event_action <> 'document.exemption_removed' and app_private.document_obligation_state(r, now()) not in ('grace', 'missing', 'rejected', 'expired')) then
      return 0;
    end if;
    return app_private.notify('documents.requested', r.workspace_id, array[person.user_id],
      -- One go, one notice: every document asked of the person in one transaction is one event.
      case when event_action = 'document.exemption_removed' then 'doc_request:' || r.id::text || ':' || coalesce(event_metadata ->> 'revision', '')
           else 'doc_request:' || r.employee_id::text || ':' || txid_current()::text end,
      'You have documents to complete', 'Open your documents to see what is asked and by when.',
      '/account/documents?workspace=' || r.workspace_id::text, actor, 'document_requirement', r.id,
      jsonb_build_object('requirement_id', r.id, 'title', r.title));
  end if;

  if event_action = 'document.submitted' then
    -- Accepted without review: nobody to ask, and the sender knows.
    if event_metadata ->> 'state' is distinct from 'pending_review' then
      return 0;
    end if;
    return app_private.notify('documents.review_needed', r.workspace_id,
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
    return sent;
  end if;
  return 0;
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

-- One case: access restricted or back (any time), then after 09:00 in the person's zone the due dates
-- (7, 1, 0 days) and the expiry dates (30, 7, 1 days). Each milestone once (its key).
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
  blocked boolean;
  last_state text;
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

  -- Access: told when it changes, against the last such notice.
  blocked := app_private.document_actor_blocked(u, w);
  select n.data ->> 'state' into last_state from public.person_notifications n
  where n.workspace_id = w and n.user_id = u and n.type_key = 'documents.access_changed'
  order by n.created_at desc, n.id desc limit 1;
  if blocked and last_state is distinct from 'restricted' or not blocked and last_state = 'restricted' then
    sent := sent + app_private.notify('documents.access_changed', w, array[u],
      'doc_access:' || c.employee_id::text || ':' || case when blocked then 'restricted' else 'restored' end || ':' || at_time::text,
      case when blocked then 'Upload your documents to use ' || (select x.name from public.workspaces x where x.id = w) || ' again'
           else 'Your access is back' end,
      case when blocked then 'A required document is past its due date.' else 'Your documents are in order.' end,
      '/account/documents?workspace=' || w::text, null, 'employee_documents', c.employee_id,
      jsonb_build_object('state', case when blocked then 'restricted' else 'restored' end));
  end if;

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
    if q.kind = 'document' and q.approved_document_id is not null then
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
  begin
   perform app_private.document_check_case(c.id, at_time);
  exception when others then
   raise warning 'documents_maintain_service: case % skipped: % (%)', c.id, sqlerrm, sqlstate;
  end;
 end loop;
 return jsonb_build_object('checked',checked,'suspended',suspended);
end;
$$;
