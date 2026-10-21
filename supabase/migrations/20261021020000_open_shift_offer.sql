-- Open shifts reach the pool when the manager offers them (Mert, 2026-10-20; replaces the
-- "only a release reaches the pool" part of S-151 (3)). Publishing asks once about the open
-- shifts the publish brings: offer them to eligible employees, keep them as open shifts only
-- managers see, or delete them. An offered open shift is a pool request nobody owns, made by
-- the publication that offered it; employees ask and a manager approves as for a release.
-- An open shift no longer reaches an employee any other way (Employee Hub, team schedule).

alter table public.shift_exchange_cases
  add column open_shift_publication_id uuid,
  add constraint shift_exchange_cases_open_shift_publication_fkey foreign key (open_shift_publication_id, workspace_id)
    references public.schedule_location_publications(id, workspace_id),
  alter column owner_id drop not null,
  add constraint shift_exchange_cases_open_shift_check check ((owner_id is null) = (open_shift_publication_id is not null)),
  add constraint shift_exchange_cases_open_shift_pool_check check (owner_id is not null or (kind = 'cover' and audience = 'eligible_pool'));

comment on column public.shift_exchange_cases.open_shift_publication_id is
  'The publication that offered this open shift to eligible employees; set exactly when nobody owns the request (Mert, 2026-10-20).';

-- The open shifts a publish asks about: in its scope, nobody on them, still open for requests
-- (4 hours before the shift), and not already published as this same open shift. Open shifts
-- published before are not asked about again until they change.
create or replace function app_private.schedule_publication_open_shifts(preview jsonb) returns jsonb
  language sql stable
  set search_path to ''
  as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'location_id', d.location_id, 'location_name', l.name, 'job_id', d.job_id,
      'job_name', coalesce(j.name, 'Unassigned position'), 'scheduled_date', d.scheduled_date,
      'start_time', to_char(d.start_time, 'HH24:MI'), 'end_time', to_char(d.end_time, 'HH24:MI'))
    order by d.scheduled_date, d.start_time, l.name, d.id), '[]'::jsonb)
  from public.schedule_draft_shifts d
  join public.locations l on l.id = d.location_id
  left join public.jobs j on j.id = d.job_id
  where d.draft_id = (preview ->> 'draft_id')::uuid
    and d.employee_id is null
    and d.location_id in (select (x ->> 'location_id')::uuid from jsonb_array_elements(coalesce(preview -> 'locations', '[]'::jsonb)) x)
    and public.schedule_shift_in_department_scope_service(d.job_id,
      case when jsonb_typeof(preview -> 'department_ids') = 'array'
        then array(select jsonb_array_elements_text(preview -> 'department_ids'))::uuid[] end,
      coalesce((preview ->> 'include_no_department')::boolean, true))
    and lower(app_private.shift_time_range(d.scheduled_date, d.start_time, d.end_time, coalesce(d.time_timezone, l.timezone)))
      - interval '4 hours' > now()
    and not exists (
      select 1 from public.schedule_published_shifts p
      join public.schedule_location_publications pub on pub.id = p.publication_id and pub.status = 'current'
      where p.workspace_id = d.workspace_id and p.source_shift_id = d.id and p.employee_id is null
        and p.job_id is not distinct from d.job_id and p.shift_type_id is not distinct from d.shift_type_id
        and p.scheduled_date = d.scheduled_date and p.start_time is not distinct from d.start_time
        and p.end_time is not distinct from d.end_time and p.time_basis is not distinct from d.time_basis
        and p.time_snapshot is not distinct from d.time_snapshot and p.time_timezone is not distinct from d.time_timezone
        and p.note is not distinct from d.note)
$$;

alter function app_private.schedule_publication_open_shifts(jsonb) owner to postgres;
revoke all on function app_private.schedule_publication_open_shifts(jsonb) from public;

CREATE OR REPLACE FUNCTION "app_private"."schedule_publication_changes_since_start"("preview" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select case when jsonb_typeof(preview -> 'locations') is distinct from 'array' then preview
  else jsonb_set(preview, '{locations}', coalesce((
    select jsonb_agg(item || jsonb_build_object('changed_since_start', (
      select case
        when current_publication.id is not null then jsonb_build_object(
          'kind', 'published',
          'by_name', coalesce(publisher.display_name, 'Another manager'),
          'at', current_publication.published_at)
        else jsonb_build_object(
          'kind', 'unpublished',
          'by_name', coalesce(unpublisher.display_name, 'Another manager'),
          'at', latest.unpublished_at)
      end
      from public.schedule_drafts draft
      left join public.schedule_location_publications current_publication
        on current_publication.id = nullif(item ->> 'active_publication_id', '')::uuid
      left join public.user_profiles publisher on publisher.user_id = current_publication.published_by
      left join lateral (
        select publication.* from public.schedule_location_publications publication
        where publication.location_id = (item ->> 'location_id')::uuid
          and publication.week_start = draft.week_start
        order by publication.version_number desc
        limit 1
      ) latest on true
      left join public.user_profiles unpublisher on unpublisher.user_id = latest.unpublished_by
      where draft.id = (preview ->> 'draft_id')::uuid
        and current_publication.id is distinct from (
          select publication.id from public.schedule_location_publications publication
          where publication.id = any(draft.base_publication_ids)
            and publication.location_id = (item ->> 'location_id')::uuid
        )
    )) order by position)
    from jsonb_array_elements(preview -> 'locations') with ordinality entry(item, position)
  ), '[]'::jsonb))
  -- The open shifts this publish asks about (Mert, 2026-10-20); the draft revision guards them.
  || jsonb_build_object('open_shifts', app_private.schedule_publication_open_shifts(preview)) end;
$$;

-- A step on a request nobody owns says what happens to the open shift, not to an owner.
CREATE OR REPLACE FUNCTION "public"."shift_exchange_emit"("actor" "uuid", "w" "uuid", "cid" "uuid", "aid" "uuid", "act" "text", "msg" "text", "private_msg" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if exists (select 1 from public.shift_exchange_cases c where c.id = cid and c.owner_id is null) then
    msg := case act
      when 'application_submitted' then 'A teammate asked for this open shift. A manager decides.'
      when 'expired' then 'This offer closed 4 hours before the shift. The shift stays open.'
      when 'invalidated' then 'The shift changed, so this offer ended. The shift stays open.'
      when 'transfer_completed' then 'A manager approved. The teammate who asked now works this shift.'
      when 'case_closed' then replace(msg, 'A manager closed this request. The owner keeps this shift.', 'A manager closed this offer. The shift stays open.')
      else msg end;
  end if;
  -- The case's history (Shift Hub, Requests): one row per step.
  insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
  values(w,cid,aid,actor,act,msg,private_msg);
  -- And the people the step changes (TAKAS-BILDIRIM).
  perform app_private.shift_exchange_tell(actor, w, cid, aid, act);
end; $$;


CREATE OR REPLACE FUNCTION "app_private"."shift_exchange_tell"("actor" "uuid", "w" "uuid", "cid" "uuid", "aid" "uuid", "act" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  c public.shift_exchange_cases%rowtype;
  a public.shift_exchange_applications%rowtype;
  approvals constant text[] := array['shift_changes.approval_needed', 'shift_changes.approval_reminder'];
  invitations constant text[] := array['shift_changes.cover_asked', 'shift_changes.swap_offered'];
  hub text;
  desk text := '/app/schedule/requests?type=shift_changes';
  key text := 'case:' || cid::text;
  owner_user uuid;
  owner_name text;
  whose text;
  whose_day text;
  who_user uuid;
  who_name text;
  day text;
  day_only text;
  theirs text;
  pool boolean;
  what text;
  askers uuid[];
  deciders uuid[];
  facts jsonb;
  sent integer := 0;
begin
  select * into c from public.shift_exchange_cases x where x.id = cid and x.workspace_id = w;
  if c.id is null then
    return 0;
  end if;
  if aid is not null then
    select * into a from public.shift_exchange_applications x where x.id = aid and x.case_id = cid;
    who_user := app_private.shift_exchange_user(w, a.employee_id);
    who_name := app_private.shift_exchange_name(w, a.employee_id);
  end if;
  owner_user := app_private.shift_exchange_user(w, c.owner_id);
  owner_name := app_private.shift_exchange_name(w, c.owner_id);
  day := app_private.shift_exchange_shift_text(w, c.offered_snapshot);
  -- An open shift a publish offered has nobody's name on it (Mert, 2026-10-20).
  whose := case when c.owner_id is null then 'the open shift' else owner_name || '''s shift' end;
  whose_day := case when c.owner_id is null then 'the open shift ' || day else owner_name || '''s ' || day end;
  day_only := to_char((c.offered_snapshot ->> 'date')::date, 'FMDy, FMMon FMDD');
  theirs := case when c.kind = 'swap' then app_private.shift_exchange_shift_text(w, c.requested_snapshot) end;
  pool := c.audience = 'eligible_pool';
  -- Shift Hub opens on the case and its days (it reads 42 days from today otherwise).
  hub := '/app/employee-hub/shift-hub?case=' || cid::text
    || '&from=' || least(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'))
    || '&to=' || greatest(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'));
  what := case when c.kind = 'swap' then 'swap' else 'cover' end;
  facts := jsonb_build_object('case_id', cid, 'kind', c.kind, 'audience', c.audience)
    || case when aid is not null then jsonb_build_object('application_id', aid) else '{}'::jsonb end;

  if act = 'cover_opened' then
    -- An offered open shift waits in Shift Hub: nobody is told until the notification program starts.
    if c.owner_id is null then
      return 0;
    end if;
    -- A release, to everyone it reaches (plan 04:51).
    return app_private.notify('shift_changes.open_shift_available', w, app_private.shift_exchange_pool(w, cid), key || ':open',
      'Extra shift available', owner_name || ' can''t make ' || day || '. Want it?', hub || '&hub_view=available', actor, 'shift_exchange_case', cid, facts);

  elsif act = 'peer_invited' then
    if c.kind = 'swap' then
      return app_private.notify('shift_changes.swap_offered', w, array[who_user], key || ':invite:' || aid::text,
        'Confirm your swap with ' || owner_name, 'You give ' || theirs || ' · You get ' || day, hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_asked', w, array[who_user], key || ':invite:' || aid::text,
      owner_name || ' asked you to cover', day, hub, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('application_submitted', 'peer_accepted') then
    if act = 'peer_accepted' then
      perform app_private.shift_exchange_resolve(w, cid, invitations, 'accepted', actor, array[who_user]);
      if c.kind = 'swap' then
        sent := sent + app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || ' confirmed your swap', 'You give ' || day || ' · You get ' || theirs || '. Your manager decides.',
          hub, actor, 'shift_exchange_case', cid, facts);
      end if;
    end if;
    -- Who decides hears it once while a card of theirs is open (plan 05:03: the first one asking rings).
    deciders := array(select u from unnest(app_private.shift_exchange_deciders(w, cid, a.employee_id)) u
      where not exists (select 1 from public.person_notifications n where n.workspace_id = w
        and n.subject_type = 'shift_exchange_case' and n.subject_id = cid and n.user_id = u
        and n.type_key = any (approvals) and n.resolved_at is null));
    return sent + app_private.notify('shift_changes.approval_needed', w, deciders, key || ':approval:' || aid::text,
      'Shift change needs your approval',
      case when c.kind = 'swap' then owner_name || ' and ' || who_name || ' want to swap ' || day || ' for ' || theirs
        else who_name || ' wants ' || whose_day end,
      desk, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('peer_declined', 'application_withdrawn', 'application_closed') then
    -- An answer: declined, taken back, or closed because its teammate left (close_employee_side).
    perform app_private.shift_exchange_resolve(w, cid, invitations,
      case act when 'peer_declined' then 'declined' when 'application_withdrawn' then 'withdrawn' else 'closed' end, actor, array[who_user]);
    if not pool then
      if c.kind = 'swap' then
        sent := app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || case act when 'peer_declined' then ' declined your swap' when 'application_withdrawn' then ' withdrew from your swap'
            else ' can no longer swap with you' end,
          'Nothing changed. You still work ' || day || '.', hub, actor, 'shift_exchange_case', cid, facts);
      else
        sent := app_private.notify('shift_changes.cover_unfilled', w, array[owner_user], key || ':unfilled:' || aid::text,
          'No one could cover your ' || day_only || ' shift',
          who_name || case when act = 'peer_declined' then ' can''t cover it.' else ' can no longer cover it.' end
            || ' You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts);
      end if;
      perform app_private.shift_exchange_resolve(w, cid, null, 'withdrawn', actor);
    elsif not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'withdrawn', actor);
    end if;
    return sent;

  elsif act = 'scope_approved' then
    -- One location approved a two-location swap: its deciders' cards close; the other location's wait.
    perform app_private.shift_exchange_resolve(w, cid, approvals, 'approved', actor,
      array(select u from unnest(app_private.shift_exchange_deciders(w, cid, a.employee_id)) u
            where u <> all (app_private.shift_exchange_deciders(w, cid, a.employee_id, true))));
    return 0;

  elsif act = 'application_rejected' then
    -- The reason is the applicant's (BL-910); the owner reads that it was declined.
    sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
      case when pool then 'Your pickup request was declined'
        when c.kind = 'swap' then 'Your swap with ' || owner_name || ' was declined'
        else 'Your cover for ' || owner_name || ' was declined' end,
      coalesce(nullif(btrim(coalesce(a.reason, '')), ''), day || '. Your schedule has not changed.'),
      hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
    if not pool then
      sent := sent + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your manager declined the ' || what,
        case when c.kind = 'swap' then 'Nothing changed. You still work ' || day || '.'
          else who_name || ' won''t cover ' || day || '. You are still responsible for this shift.' end,
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
      perform app_private.shift_exchange_resolve(w, cid, null, 'declined', actor);
    elsif not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'declined', actor);
    end if;
    return sent;

  elsif act = 'other_selected' then
    if pool then
      return app_private.notify('shift_changes.open_shift_taken', w, array[who_user], key || ':taken:' || aid::text,
        'Another teammate got it', day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_taken', w, array[who_user], key || ':taken:' || aid::text,
      'Someone else is covering', day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);

  elsif act = 'transfer_completed' then
    if c.kind = 'swap' then
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || day || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || theirs || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'));
    else
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        case when pool then 'Your pickup is approved' else 'Your cover is approved' end, day || '. It''s yours now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'You are no longer responsible for this shift', who_name || ' works ' || day || ' now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'));
    end if;
    perform app_private.shift_exchange_resolve(w, cid, null, 'approved', actor);
    return sent;

  elsif act = 'case_closed' then
    askers := array(select app_private.shift_exchange_user(w, x.employee_id) from public.shift_exchange_applications x
      where x.case_id = cid and x.status = 'closed_case_cancelled');
    if c.owner_id is not null and actor is not distinct from owner_user then
      -- Taken back (plan §3 Release: "Maria kept this shift").
      sent := app_private.notify(case when pool then 'shift_changes.open_shift_kept' else 'shift_changes.closed' end, w, askers,
        key || ':closed', case when pool then owner_name || ' kept this shift' else owner_name || ' cancelled the request' end,
        day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    else
      -- A manager's reason is for who asked, as a decline's is.
      sent := app_private.notify_rows(w, actor, (
        select coalesce(jsonb_agg(jsonb_build_object('type', 'shift_changes.closed', 'user_id', app_private.shift_exchange_user(w, x.employee_id),
          'event_key', key || ':closed', 'title', 'A manager closed the request for ' || whose,
          'body', coalesce(nullif(btrim(coalesce(x.reason, '')), ''), day || '. Your schedule has not changed.'),
          'url', hub, 'subject_type', 'shift_exchange_case', 'subject_id', cid, 'data', facts)), '[]'::jsonb)
        from public.shift_exchange_applications x where x.case_id = cid and x.status = 'closed_case_cancelled'))
        + app_private.notify('shift_changes.closed', w, array[owner_user], key || ':closed', 'A manager closed your request',
        day || '. You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    perform app_private.shift_exchange_resolve(w, cid, null, 'cancelled', actor);
    return sent;

  elsif act in ('expired', 'invalidated') and aid is not null then
    -- One acceptance ended (refresh_weekly_exchange_terms: the new hours overlap the teammate's other shift);
    -- the request stays open: only that teammate hears it, and only their cards close.
    sent := app_private.notify('shift_changes.closed', w, array[who_user], key || ':ended:' || aid::text,
      'Your request for ' || whose || ' ended',
      'The shift changed and now overlaps another of your shifts. Your schedule has not changed.',
      hub, actor, 'shift_exchange_case', cid, facts);
    perform app_private.shift_exchange_resolve(w, cid, null, 'shift_changed', actor, array[who_user]);
    if not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'shift_changed', actor);
    end if;
    return sent;

  elsif act in ('expired', 'invalidated') then
    -- Everything closes 4 hours before the shift, and a changed shift ends it; everyone it held hears it
    -- (plan §4.1, §4.2).
    askers := array(select app_private.shift_exchange_user(w, x.employee_id) from public.shift_exchange_applications x
      where x.case_id = cid and x.status = act);
    sent := app_private.notify('shift_changes.closed', w, array[owner_user], key || ':closed', 'Your shift change request closed',
        case when act = 'expired' then 'It closed 4 hours before the shift. ' else 'The shift changed, so it ended. ' end
        || 'You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts)
      + app_private.notify('shift_changes.closed', w, askers, key || ':closed', 'The request for ' || whose || ' closed',
        case when act = 'expired' then 'It closed 4 hours before the shift. ' else 'The shift changed, so it ended. ' end
        || 'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    perform app_private.shift_exchange_resolve(w, cid, null, case when act = 'expired' then 'expired' else 'shift_changed' end, actor);
    return sent;
  end if;
  return 0;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."shift_exchange_remind"("pass_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  c public.shift_exchange_cases%rowtype;
  a public.shift_exchange_applications%rowtype;
  first_ask timestamptz;
  waiting uuid[];
  owner_name text;
  who_name text;
  said text;
  zone text;
  fmt text;
  turn integer;
  done integer := 0;
begin
  for c in select x.* from public.shift_exchange_cases x
    where x.status = 'open' and x.expires_at > now()
      and exists (select 1 from public.shift_exchange_applications p where p.case_id = x.id and p.status = 'pending_manager')
    order by x.expires_at, x.id limit pass_limit loop
    begin
    -- The lock a decision holds (shift_exchanges_command_service): a case being decided waits for the next pass.
    if not pg_try_advisory_xact_lock(hashtextextended(c.workspace_id::text, 921)) then
      continue;
    end if;
    if not exists (select 1 from public.shift_exchange_cases x where x.id = c.id and x.status = 'open')
      or public.shift_exchange_live_status(c.workspace_id, c.id) <> 'open' then
      continue;
    end if;
    select min(e.created_at) into first_ask from public.shift_exchange_events e
    where e.case_id = c.id and e.action in ('application_submitted', 'peer_accepted');
    if first_ask is null then
      continue;
    end if;
    select * into a from public.shift_exchange_applications p where p.case_id = c.id and p.status = 'pending_manager'
    order by p.created_at, p.id limit 1;
    waiting := app_private.shift_exchange_deciders(c.workspace_id, c.id, a.employee_id, true);
    owner_name := app_private.shift_exchange_name(c.workspace_id, c.owner_id);
    who_name := app_private.shift_exchange_name(c.workspace_id, a.employee_id);
    said := case when c.kind = 'swap'
      then owner_name || ' and ' || who_name || ' want to swap ' || app_private.shift_exchange_shift_text(c.workspace_id, c.offered_snapshot)
        || ' for ' || app_private.shift_exchange_shift_text(c.workspace_id, c.requested_snapshot)
      -- An open shift a publish offered has nobody's name on it (Mert, 2026-10-20).
      when c.owner_id is null then who_name || ' wants the open shift ' || app_private.shift_exchange_shift_text(c.workspace_id, c.offered_snapshot)
      else who_name || ' wants ' || owner_name || '''s ' || app_private.shift_exchange_shift_text(c.workspace_id, c.offered_snapshot) end;
    if now() >= c.expires_at - interval '4 hours' then
      if first_ask >= c.expires_at - interval '4 hours'
        or exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
        continue;
      end if;
      -- A new reminder replaces the one before it.
      perform app_private.shift_exchange_resolve(c.workspace_id, c.id, array['shift_changes.approval_reminder'], 'reminded_again', null, waiting);
      zone := coalesce(c.offered_snapshot ->> 'timezone', 'UTC');
      fmt := (select x.time_format from public.workspace_scheduling_settings x where x.workspace_id = c.workspace_id);
      done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting, 'case:' || c.id::text || ':last_call',
        'Decide by ' || to_char(c.expires_at at time zone zone, case when fmt = '24h' then 'FMDy HH24:MI' else 'FMDy FMHH12:MI AM' end)
          || ' or it closes',
        said, '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
        jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience, 'last_call', true));
    elsif not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                      and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
      turn := floor(extract(epoch from now() - first_ask) / 43200)::integer;
      if turn >= 1 and not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':reminder:' || turn::text) then
        perform app_private.shift_exchange_resolve(c.workspace_id, c.id, array['shift_changes.approval_reminder'], 'reminded_again', null, waiting);
        done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting,
          'case:' || c.id::text || ':reminder:' || turn::text, 'Shift change still waits for your approval',
          said, '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
          jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience));
      end if;
    end if;
    exception when others then
      -- One broken case does not stop the others' reminders (as time_off_sweep).
      raise warning 'shift-exchange-reminders: case % of workspace % failed: % %', c.id, c.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'time_off_timezone', app_private.time_off_timezone(target_workspace_id, employee.id),
    'settings', jsonb_build_object('time_off_lead_hours', coalesce((select s.time_off_lead_hours from public.workspace_scheduling_settings s where s.workspace_id = target_workspace_id), 24)),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'shift_type_name',shift_type.name
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      left join public.shift_types shift_type on shift_type.id=shift.shift_type_id and shift_type.workspace_id=shift.workspace_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    -- An open shift reaches an employee only offered, in Shift Hub, to who is eligible (Mert, 2026-10-20).
    -- The field stays empty until the clients stop reading it (EKRAN 02 #47).
    'open_shifts', '[]'::jsonb,
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'is_management',coalesce((select department.system_key='management' from public.departments department
          where department.id=job.department_id and department.workspace_id=shift.workspace_id),false)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','denied','revoked','expired')),'[]'), 'status',request.status::text,'display_status',app_private.time_off_display_status(target_workspace_id,request.id),'decide_by',request.decide_by,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $$;


ALTER FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_onboarding_review_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', (app_private.document_view(actor_user_id, requirement)).status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', (app_private.document_view(actor_user_id, requirement)).rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and (app_private.document_view(actor_user_id, requirement)).status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null
    -- a row the reader may not see is not counted either (S2)
    and (requirement.kind <> 'document' or app_private.document_row_readable(actor_user_id, requirement));
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_employee_schedule_board_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor public.employee_profiles%rowtype;
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  result jsonb;
begin
  actor := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        where assignment.employee_id = actor.id
          and assignment.location_id = location.id
          and assignment.ended_at is null
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
      -- ROL-CIFT 2.1: the team is the people who can be scheduled; who only manages is not on it.
      and app_private.has_employee_access(target_workspace_id, employee.user_id)
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
      -- An open shift is the manager's: offered, it reaches who may take it in Shift Hub (Mert, 2026-10-20).
      and shift.employee_id is not null
  ), own_availability as materialized (
    -- The employee's own marks; the manager's private reminder never reaches here.
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start, array[actor.id],
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location), false)
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h')
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision', shift_type.default_revision,
        'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'shift_labels', '[]'::jsonb,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', app_private.stored_primary_job(employee.id)
      ) || case when employee.id = actor.id then jsonb_build_object('weekly_availability', coalesce((
          select jsonb_agg(own.projection order by own.location_id)
          from own_availability own
          where exists (select 1 from public.employee_location_assignments assignment
            where assignment.employee_id = actor.id and assignment.location_id = own.location_id
              and assignment.ended_at is null)), '[]'::jsonb))
        else '{}'::jsonb end
      order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis', shift.time_basis,
        'time_snapshot', shift.time_snapshot,
        'time_timezone', shift.time_timezone,
        'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', case when shift.employee_id = actor.id then shift.note else '' end,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.status <> 'scheduled'
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Only a conflict with the employee's own marks, as accepted at publishing.
          case when shift.employee_id = actor.id
            and coalesce((shift.availability_snapshot -> 'assessment' ->> 'has_availability_conflict')::boolean, false)
            and jsonb_array_length(coalesce(shift.availability_snapshot -> 'assessment' -> 'employee_intervals', '[]'::jsonb)) > 0
          then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'opens', to_char(closure.opens, 'HH24:MI'), 'closes', to_char(closure.closes, 'HH24:MI'),
        'announcement_id', closure.announcement_id
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
        and closure.status <> 'scheduled'
    ), '[]'::jsonb),
    -- Records on the Schedule that are out to the employee and touch the week,
    -- one row per their checked location; a record for no location is theirs
    -- wherever they work. A yearly record's next year is its own record.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'location_id', place.location_id, 'title', item.title,
        'category', item.category, 'category_other', item.category_other,
        'starts_on', item.starts_on, 'ends_on', coalesce(item.ends_on, item.starts_on),
        'status', item.status, 'publish_at', item.publish_at, 'day', place.day,
        'opens', to_char(place.opens, 'HH24:MI'), 'closes', to_char(place.closes, 'HH24:MI'),
        'event_from', to_char(item.event_from, 'HH24:MI'), 'event_until', to_char(item.event_until, 'HH24:MI')
      ) order by item.starts_on, item.title, place.location_id)
      from public.announcements item
      cross join lateral (
        select target.location_id, target.day, target.opens, target.closes
        from public.announcement_locations target
        join allowed_locations location on location.id = target.location_id
        where target.announcement_id = item.id
        union all
        select null::uuid, 'open', null::time, null::time
        where not exists (
          select 1 from public.announcement_locations target
          join public.locations location on location.id = target.location_id and location.archived_at is null
          where target.announcement_id = item.id)
      ) place
      where item.workspace_id = target_workspace_id and item.status = 'published' and item.archived_at is null
        and item.on_schedule and item.starts_on is not null
        and item.starts_on <= resolved_week_start + 6 and resolved_week_start <= coalesce(item.ends_on, item.starts_on)
        and app_private.announcement_reaches(item, actor_user_id)
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift),
      array(select shift.shift_type_id from current_shifts shift))
  into result;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."employee_side_impact"("w" "uuid", "emp" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'shifts_opened', (
      select count(*)::integer
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication
        on publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
       and publication.location_id = shift.location_id and publication.status = 'current'
      join public.locations location on location.id = shift.location_id and location.workspace_id = shift.workspace_id
      where shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()),
    'requests_closed', (
      select count(*)::integer from public.shift_exchange_cases c
      where c.workspace_id = w and c.owner_id = emp and c.status = 'open'),
    'applications_closed', (
      select count(*)::integer
      from public.shift_exchange_applications a
      join public.shift_exchange_cases c on c.id = a.case_id and c.workspace_id = a.workspace_id
      where a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
        and c.status = 'open' and c.owner_id is distinct from emp),
    'time_off_withdrawn', (
      select count(*)::integer from public.schedule_time_off_requests r
      where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'),
    'availability_deleted',
      exists (select 1 from public.employee_weekly_preferences p where p.workspace_id = w and p.employee_id = emp)
      or exists (select 1 from public.manager_weekly_reminders m where m.workspace_id = w and m.employee_id = emp))
$$;

-- The publish takes the choice for its open shifts; the form without it goes.
DROP FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb");

CREATE OR REPLACE FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb" DEFAULT '[]'::"jsonb", "open_shift_choice" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  requested uuid;
  result jsonb;
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
  pairs jsonb := '[]'::jsonb;
  publish_event_id uuid;
  asked uuid[];
  source uuid;
  other record;
  offered jsonb;
  offer public.shift_exchange_cases%rowtype;
begin
  -- The open shifts the publish brings (Mert, 2026-10-20): offer, keep, or delete. Nothing named keeps them.
  if open_shift_choice is not null and open_shift_choice not in ('offer', 'keep', 'delete') then
    raise exception 'Choose offer, keep or delete for the open shifts' using errcode = '22023';
  end if;
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));

  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  -- The one place that says which findings are recorded and with which
  -- sentence (BL-190); the publisher's id and the time go with each row.
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  asked := array(select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(preview -> 'open_shifts', '[]'::jsonb)) x);
  if open_shift_choice = 'delete' and cardinality(asked) > 0 then
    -- Deleted open shifts leave the draft and an edit of this draft holding them, as a removal on the
    -- Schedule would. Another draft of the week keeps its own copy (drafts share shift ids).
    with gone as (
      delete from public.schedule_edit_session_shifts copy
      where copy.workspace_id = target_workspace_id and copy.id = any(asked) and copy.employee_id is null
        and copy.session_id in (select e.id from public.schedule_edit_sessions e where e.source_draft_id = target_draft.id)
        -- Only a copy still as the draft has it: a change made in an open edit stays that edit's.
        and exists (select 1 from public.schedule_draft_shifts d where d.draft_id = target_draft.id and d.id = copy.id
          and public.shift_exchange_edit_matches(to_jsonb(copy), to_jsonb(d)))
        and copy.pending_op_type is distinct from 'delete'
      returning copy.session_id)
    update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from gone);
    delete from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id and shift.id = any(asked) and shift.employee_id is null;
    update public.schedule_drafts set revision = revision + 1, updated_at = now()
    where id = target_draft.id returning * into target_draft;
    perform app_private.schedule_edit_undo_barrier();
  end if;
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      if decision is null then continue; end if;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id, shift.label_ids, shift.label_names from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id, shift.label_ids, shift.label_names from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);
    pairs := pairs || jsonb_build_array(jsonb_build_object('previous', previous_publication_id, 'current', new_publication_id));

  end loop;

  -- What the publish asked about goes as the publisher chose; a request on it that the change
  -- ended closes as Shift Hub would close it.
  foreach source in array asked loop
    for other in select x.id, public.shift_exchange_live_status(target_workspace_id, x.id) live_status
      from public.shift_exchange_cases x where x.workspace_id = target_workspace_id and x.status = 'open' and x.offered_source_id = source
    loop
      if other.live_status <> 'open' then
        update public.shift_exchange_cases set status = other.live_status, revision = revision + 1, updated_at = now() where id = other.id;
        update public.shift_exchange_applications set status = other.live_status, updated_at = now()
        where case_id = other.id and status in ('invited', 'pending_manager');
        delete from public.shift_exchange_votes where case_id = other.id;
        perform public.shift_exchange_emit(actor_user_id, target_workspace_id, other.id, null, other.live_status,
          'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
      -- Without a choice (an older screen) an offer that still holds is left as it is.
      elsif open_shift_choice in ('keep', 'delete') then
        update public.shift_exchange_cases set status = 'cancelled', revision = revision + 1, updated_at = now() where id = other.id;
        update public.shift_exchange_applications set status = 'closed_case_cancelled', updated_at = now()
        where case_id = other.id and status in ('invited', 'pending_manager');
        delete from public.shift_exchange_votes where case_id = other.id;
        perform public.shift_exchange_emit(actor_user_id, target_workspace_id, other.id, null, 'case_closed',
          'A manager closed this request. The owner keeps this shift.');
      end if;
    end loop;
    if open_shift_choice = 'offer' and not exists (select 1 from public.shift_exchange_cases x
      where x.workspace_id = target_workspace_id and x.status = 'open' and x.offered_source_id = source) then
      offered := public.shift_exchange_shift(target_workspace_id, source);
      if offered is not null and offered ->> 'employee_id' is null
        and app_private.shift_exchange_deadline(offered, null) > clock_timestamp() then
        insert into public.shift_exchange_cases (workspace_id, kind, audience, offered_source_id, owner_id, offered_snapshot,
          consent_fingerprint, expires_at, created_by, open_shift_publication_id)
        values (target_workspace_id, 'cover', 'eligible_pool', source, null, offered,
          public.shift_exchange_fingerprint(target_workspace_id, offered, null), app_private.shift_exchange_deadline(offered, null),
          actor_user_id, (select p.publication_id from public.schedule_published_shifts p where p.id = (offered ->> 'id')::uuid))
        returning * into offer;
        -- Its history starts here; nobody is told (the pool waits in Shift Hub).
        insert into public.shift_exchange_events (workspace_id, case_id, application_id, actor_user_id, action, message, private_note)
        values (target_workspace_id, offer.id, null, actor_user_id, 'cover_opened',
          'Offered to eligible employees when the schedule was published.', '');
        perform realtime.send(jsonb_build_object('workspace_id', target_workspace_id, 'case_id', offer.id, 'revision', offer.revision),
          'changed', 'shift-exchanges:' || target_workspace_id::text, true);
      end if;
    end if;
  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  ) returning id into publish_event_id;
  -- Whose shifts changed hears it once (S-95; schedule_tell_published).
  perform app_private.schedule_tell_published(target_workspace_id, actor_user_id, publish_event_id,
    target_draft.week_start, pairs, array(select distinct x::uuid from jsonb_array_elements(preview -> 'locations') l,
      jsonb_array_elements_text(l -> 'affected_employee_ids') x));
  result := jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );

  -- Nobody missing a required document goes out on the published week.
  if public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409', hint='schedule.publication_changed';
end;
$$;

ALTER FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb", "open_shift_choice" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb", "open_shift_choice" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb", "open_shift_choice" "text") TO "service_role";
