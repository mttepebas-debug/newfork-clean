-- Bildirim paneli slice 2, documents (KARARLAR S-247 (3), Mert 2026-10-23): every person's notice is their own.
-- When what a document card asks for is done, the card says how and who did it; it is never deleted; read is
-- per person, and only the one who did it has their own card read (read and seen, as Mark read does).
--   * handed in: the person's "due" card (documents.due_soon) closes when they hand the document in:
--     accepted without review -> completed, waiting for review -> submitted, a policy signed ->
--     acknowledged. Before, it closed only on a decision, an exemption, an unassignment or a pause;
--   * declined: only the reviewers' cards (documents.review_needed) close as declined. The person's own due
--     card is no longer closed as "declined": they upload again. One type each, inline, never
--     notification_resolve, which closes every open card the requirement has;
--   * access back: "Your access is back" (documents.access_changed) is written by document_access_told in
--     the transaction that lifts the block, before the event's document_tell. Its closing of the person's
--     "documents to complete" no longer takes that card along at birth (created_at = now(), the
--     transaction's start): it is news, not a request;
--   * due again sooner: due cards come at 7, 1 and 0 days; a newer one for a document closes the person's
--     earlier open ones for that document as superseded (by nobody: the daily check), read as they were.
-- Only app_private.document_tell and app_private.document_check_case change; their signatures, language,
-- security and grants stay. document_access_told is unchanged.

create or replace function app_private.document_tell(r public.employee_onboarding_requirements, actor uuid, event_action text,
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
  closing_type text;
  closing_as text;
  closed_for uuid[];
  listener uuid;
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
    -- A decline is closed below, the reviewers' cards only (S-247).
    if decided = 'approved' then
      perform app_private.notification_resolve(r.workspace_id, 'document_requirement', r.id, decided, actor);
    end if;
  end if;

  -- S-247: handed in, the person's due card closes saying how; declined, only the reviewers' cards close (the
  -- person uploads again). One type each, never notification_resolve, which closes every card of the
  -- requirement. Who did it has their own card read.
  closing_type := case
    when (event_action = 'document.submitted' and event_metadata ->> 'state' in ('accepted', 'pending_review'))
         or event_action = 'document.policy_acknowledged' then 'documents.due_soon'
    when event_action = 'document.reject' then 'documents.review_needed' end;
  if closing_type is not null then
    closing_as := case
      when event_action = 'document.reject' then 'declined'
      when event_action = 'document.policy_acknowledged' then 'acknowledged'
      when event_metadata ->> 'state' = 'accepted' then 'completed'
      else 'submitted' end;
    with closed as (
      update public.person_notifications n
      set resolved_at = now(), resolution = closing_as, resolved_by = actor,
        read_at = case when n.user_id = actor then coalesce(n.read_at, now()) else n.read_at end,
        seen_at = case when n.user_id = actor then coalesce(n.seen_at, now()) else n.seen_at end
      where n.workspace_id = r.workspace_id and n.subject_type = 'document_requirement' and n.subject_id = r.id
        and n.type_key = closing_type and n.resolved_at is null
      returning n.user_id
    )
    select coalesce(array_agg(distinct c.user_id), '{}'::uuid[]) into closed_for from closed c;
    foreach listener in array closed_for loop
      perform realtime.send(jsonb_build_object('workspace_id', r.workspace_id), 'changed', 'notifications:' || listener::text, true);
    end loop;
  end if;

  -- Nothing asked of the person any more: their "documents to complete" closes.
  if not exists (
    select 1 from public.employee_onboarding_requirements x
    where x.workspace_id = r.workspace_id and x.employee_id = r.employee_id and x.kind in ('document', 'acknowledgement')
      and x.lifecycle_retired_at is null and not x.owner_excused
      and app_private.document_obligation_state(x, now()) in ('grace', 'missing', 'rejected', 'expired')
  ) then
    -- S-247: "Your access is back", written in this transaction by document_access_told on the row's change
    -- before this event, is news, not a request: it is not closed at birth. Who did it has their own read.
    with closed as (
      update public.person_notifications n
      set resolved_at = now(), resolution = 'completed', resolved_by = actor,
        read_at = case when n.user_id = actor then coalesce(n.read_at, now()) else n.read_at end,
        seen_at = case when n.user_id = actor then coalesce(n.seen_at, now()) else n.seen_at end
      from public.notification_types t
      where t.key = n.type_key and t.needs_action
        and n.workspace_id = r.workspace_id and n.subject_type = 'employee_documents' and n.subject_id = r.employee_id
        and n.resolved_at is null
        and not (n.type_key = 'documents.access_changed' and n.created_at >= now())
      returning n.user_id
    )
    select coalesce(array_agg(distinct c.user_id), '{}'::uuid[]) into closed_for from closed c;
    foreach listener in array closed_for loop
      perform realtime.send(jsonb_build_object('workspace_id', r.workspace_id), 'changed', 'notifications:' || listener::text, true);
    end loop;
  end if;
  return sent;
end;
$$;

create or replace function app_private.document_check_case(target_case uuid, at_time timestamp with time zone)
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
  due_key text;
  fresh integer;
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
        due_key := 'doc_due:' || q.id::text || ':' || q.lifecycle_revision::text || ':' || milestone::text;
        fresh := app_private.notify('documents.due_soon', w, array[u],
          due_key,
          'Due ' || case milestone when 0 then 'today' when 1 then 'tomorrow'
                     else to_char((q.deadline_at at time zone tz)::date, 'FMDy, FMMon FMDD') end || ': ' || q.title,
          null, '/account/documents?workspace=' || w::text || '&requirement=' || q.id::text, null, 'document_requirement', q.id,
          jsonb_build_object('requirement_id', q.id, 'days_left', days_left));
        sent := sent + fresh;
        -- S-247: the newer card takes over; the person's earlier open ones for this document close as superseded,
        -- read as they were. No signal of its own: notify has just signalled this person in this transaction.
        if fresh > 0 then
          update public.person_notifications n
          set resolved_at = now(), resolution = 'superseded', resolved_by = null
          where n.workspace_id = w and n.user_id = u and n.type_key = 'documents.due_soon'
            and n.subject_type = 'document_requirement' and n.subject_id = q.id
            and n.resolved_at is null and n.event_key <> due_key;
        end if;
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
