-- BL-164: a shift's tags come from Settings > Shift labels. The quick editor
-- sends label ids and names; the names were written as sent, so a manager who
-- skipped the browser could put any text on a shift, and since BL-158 that
-- text reaches the published week, the employee's week and the ghost card.
-- Now each id must be an active label of this workspace (its name is taken
-- from the catalog) or a label the shift already carries (an archived label's
-- copy stays as it was). Anything else is refused like any other bad
-- reference: 23503 'invalid shift reference'. The names the client sends are
-- ignored: one source for the name, nothing to compare.
-- Saving, publishing, saving a template and the swap review copy tags from
-- rows this function wrote, so they need no check of their own. Applying a
-- template copies the tags the template was saved with, as they were.
-- Body is the live definition from 20260926150000; only part c changed.
CREATE OR REPLACE FUNCTION public.mutate_schedule_edit_shift_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, operation text, target_shift_id uuid, expected_shift_revision integer DEFAULT NULL::integer, shift_payload jsonb DEFAULT NULL::jsonb, request_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  reach uuid[];
  write_row boolean := false;
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
  mutated_shift record;
  override_note text;
  audited_shift_id uuid;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  if operation not in ('create', 'update', 'delete', 'restore') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;
  reach := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');

  -- a. Delete and restore: a published shift is marked, an unpublished one goes.
  if operation in ('create', 'update') then
    write_row := true;
  else
    select * into target_session
    from public.schedule_edit_sessions session
    where session.id = target_session_id
      and session.workspace_id = target_workspace_id
    for update;

    if target_session.id is null or target_session.holder_user_id <> actor_user_id then
      raise exception 'edit session not found' using errcode = 'P0002';
    end if;
    if target_session.status <> 'active' or target_session.expires_at <= now() then
      raise exception 'edit lease expired' using errcode = '40001';
    end if;
    if target_session.revision <> expected_session_revision then
      raise exception 'session revision stale' using errcode = '40001';
    end if;

    select * into target_shift
    from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id
      and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and shift.location_id = any(reach)
    for update;

    if target_shift.id is null then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;

    if operation = 'restore' then
      if target_shift.source_published_shift_id is null
        or target_shift.pending_op_type is distinct from 'delete' then
        raise exception 'shift restore unavailable' using errcode = '22023';
      end if;

      update public.schedule_edit_session_shifts shift
      set pending_op_type = null,
          locked = true,
          revision = revision + 1,
          updated_at = now()
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      update public.schedule_edit_sessions
      set revision = revision + 1,
          dirty = true,
          last_heartbeat = now(),
          expires_at = now() + interval '4 minutes'
      where id = target_session_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    elsif target_shift.source_published_shift_id is null and not target_shift.locked then
      write_row := true;
    else
      update public.schedule_edit_session_shifts shift
      set pending_op_type = 'delete',
          locked = true,
          revision = revision + 1,
          updated_at = now()
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      update public.schedule_edit_sessions
      set revision = revision + 1,
          dirty = true,
          last_heartbeat = now(),
          expires_at = now() + interval '4 minutes'
      where id = target_session_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
  end if;

  -- b. Write the row: create, update, or delete an unpublished shift. The
  -- block keeps its own copy of the id and payload, as the old inner layer did.
  if write_row then
    <<write_shift>>
    declare
      row_shift_id uuid := target_shift_id;
      row_payload jsonb := shift_payload;
      target_location_id uuid;
      target_employee_id uuid;
      target_job_id uuid;
      target_shift_type_id uuid;
      target_scheduled_date date;
      target_start_time time;
      target_end_time time;
      target_unpaid_break_minutes integer;
      target_hide_time_on_badge boolean;
      target_note text;
    begin
      select * into target_session from public.schedule_edit_sessions session
      where session.id = target_session_id and session.workspace_id = target_workspace_id
      for update;
      if target_session.id is null or target_session.holder_user_id <> actor_user_id then
        raise exception 'edit session not found' using errcode = 'P0002';
      end if;
      if target_session.status <> 'active' or target_session.expires_at <= now() then
        raise exception 'edit lease expired' using errcode = '40001';
      end if;
      if target_session.revision <> expected_session_revision then
        raise exception 'session revision stale' using errcode = '40001';
      end if;

      if operation in ('create', 'update') then
        row_payload := public.normalize_schedule_time_source(target_workspace_id,row_payload,(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=target_session_id and s.id=row_shift_id));
        target_location_id := (row_payload->>'location_id')::uuid;
        target_employee_id := nullif(row_payload->>'employee_id', '')::uuid;
        target_job_id := (row_payload->>'job_id')::uuid;
        target_shift_type_id := nullif(row_payload->>'shift_type_id', '')::uuid;
        target_scheduled_date := (row_payload->>'scheduled_date')::date;
        target_start_time := nullif(row_payload->>'start_time','')::time;
        target_end_time := nullif(row_payload->>'end_time','')::time;
        target_unpaid_break_minutes := coalesce((row_payload->>'unpaid_break_minutes')::integer, 0);
        target_hide_time_on_badge := coalesce((row_payload->>'hide_time_on_badge')::boolean, false);
        target_note := coalesce(row_payload->>'note', '');
        if target_start_time = target_end_time then
          raise exception 'Start and end time cannot be the same.' using errcode = '22023';
        end if;
        if char_length(target_note) > 500
          or target_unpaid_break_minutes not in (0, 15, 30, 45, 60)
          or target_scheduled_date not between target_session.week_start and target_session.week_start + 6 then
          raise exception 'invalid shift values' using errcode = '22023';
        end if;
        perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[target_location_id]);
        if not exists (select 1 from public.jobs job where job.id = target_job_id and job.workspace_id = target_workspace_id and job.archived_at is null)
          or not exists (select 1 from public.locations location where location.id = target_location_id and location.workspace_id = target_workspace_id and location.archived_at is null)
          or (target_shift_type_id is not null and not exists (select 1 from public.shift_types shift_type where shift_type.id = target_shift_type_id and shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null))
          or (target_employee_id is not null and not exists (
            select 1 from public.employee_profiles employee
            join public.employee_location_assignments location_assignment
              on location_assignment.employee_id = employee.id and location_assignment.location_id = target_location_id and location_assignment.ended_at is null
            join public.employee_job_assignments job_assignment
              on job_assignment.employee_id = employee.id and job_assignment.job_id = target_job_id and job_assignment.ended_at is null
            where employee.id = target_employee_id and employee.workspace_id = target_workspace_id and employee.archived_at is null
          )) then
          raise exception 'invalid shift reference' using errcode = '23503';
        end if;
      end if;

      if operation = 'create' then
        if request_idempotency_key is not null and exists (
          select 1 from public.schedule_edit_session_shifts shift
          where shift.session_id = target_session_id and shift.idempotency_key = request_idempotency_key
        ) then
          result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
          exit write_shift;
        end if;
        row_shift_id:=coalesce(row_shift_id,gen_random_uuid());
        perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,row_payload||jsonb_build_object('id',row_shift_id,'session_id',target_session_id),null);
        insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, idempotency_key) values (row_shift_id, target_workspace_id, target_session_id, target_location_id, target_employee_id, target_job_id, target_shift_type_id, target_scheduled_date, target_start_time, target_end_time, row_payload->>'time_basis', row_payload->'time_snapshot', row_payload->>'time_timezone', target_unpaid_break_minutes, target_hide_time_on_badge, target_note, request_idempotency_key);
      elsif operation = 'update' then
        perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,row_payload||jsonb_build_object('id',row_shift_id,'session_id',target_session_id),(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.workspace_id=target_workspace_id and s.session_id=target_session_id and s.id=row_shift_id));
        update public.schedule_edit_session_shifts shift
        set location_id = target_location_id, employee_id = target_employee_id,
          job_id = target_job_id, shift_type_id = target_shift_type_id,
          scheduled_date = target_scheduled_date, start_time = target_start_time,
          end_time = target_end_time, time_basis=row_payload->>'time_basis', time_snapshot=row_payload->'time_snapshot', time_timezone=row_payload->>'time_timezone', unpaid_break_minutes = target_unpaid_break_minutes, hide_time_on_badge = target_hide_time_on_badge, note = target_note,
          revision = revision + 1, updated_at = now()
        where shift.session_id = target_session_id and shift.id = row_shift_id
          and shift.revision = expected_shift_revision
          and shift.location_id = any(reach);
        if not found then
          raise exception 'shift revision stale' using errcode = '40001';
        end if;
      else
        update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=row_shift_id and revoked_at is null;
        delete from public.schedule_edit_session_shifts shift
        where shift.session_id = target_session_id and shift.id = row_shift_id
          and shift.revision = expected_shift_revision
          and shift.location_id = any(reach);
        if not found then
          raise exception 'shift revision stale' using errcode = '40001';
        end if;
      end if;

      update public.schedule_edit_sessions
      set revision = revision + 1, dirty = true,
        last_heartbeat = now(), expires_at = now() + interval '4 minutes'
      where id = target_session_id;
      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end write_shift;

    -- An updated published shift becomes a pending update and unlocks.
    if operation = 'update' then
      update public.schedule_edit_session_shifts shift
      set pending_op_type = case
            when shift.source_published_shift_id is not null
             and shift.pending_op_type is distinct from 'delete'
            then 'update'
            else shift.pending_op_type
          end,
          locked = case
            when shift.source_published_shift_id is not null then false
            else shift.locked
          end
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
  end if;

  -- c. Labels: the catalog's name for an active label of this workspace, the
  -- shift's own copy for a label it already carries; anything else is refused.
  if operation in ('create', 'update') and shift_payload is not null then
    <<labels>>
    declare
      tag_ids uuid[];
      tag_names text[];
    begin
      select * into target_shift from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session_id
        and shift.id = target_shift_id
        and shift.workspace_id = target_workspace_id;
      if target_shift.id is null then
        exit labels;
      end if;

      select coalesce(array_agg(requested.id order by requested.ord), '{}'::uuid[]),
             coalesce(array_agg(coalesce(catalog.name, kept.name) order by requested.ord), '{}'::text[])
      into tag_ids, tag_names
      from (
        select tag.value::uuid as id, min(tag.ord) as ord
        from jsonb_array_elements_text(coalesce(shift_payload->'label_ids', '[]'::jsonb)) with ordinality as tag(value, ord)
        group by tag.value::uuid
      ) requested
      left join public.shift_labels catalog
        on catalog.id = requested.id
       and catalog.workspace_id = target_workspace_id
       and catalog.archived_at is null
      left join lateral (
        select copy.name from unnest(target_shift.label_ids, target_shift.label_names) as copy(id, name)
        where copy.id = requested.id limit 1
      ) kept on true;

      if array_position(tag_names, null) is not null then
        raise exception 'invalid shift reference' using errcode = '23503';
      end if;

      update public.schedule_edit_session_shifts shift
         set label_ids = tag_ids, label_names = tag_names
       where shift.session_id = target_session_id
         and shift.id = target_shift_id
         and shift.workspace_id = target_workspace_id;
      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end labels;
  end if;

  -- d. A person missing a required document is never on a shift that day.
  if operation in ('create', 'update') then
    select shift.employee_id, shift.scheduled_date
    into mutated_shift
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and shift.id = target_shift_id
    limit 1;

    if mutated_shift.employee_id is not null
      and public.employee_has_hard_document_schedule_conflict_service(
        target_workspace_id,
        mutated_shift.employee_id,
        mutated_shift.scheduled_date
      ) then
      raise exception 'employee document hard conflict' using errcode = '23514';
    end if;
  end if;

  -- e. An overridden soft conflict is audited once per request.
  override_note := btrim(coalesce(shift_payload->>'conflict_override_note', ''));

  if operation in ('create', 'update') and char_length(override_note) >= 10 then
    select shift.id
    into audited_shift_id
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and (
        shift.id = target_shift_id
        or (
          operation = 'create'
          and request_idempotency_key is not null
          and shift.idempotency_key = request_idempotency_key
        )
      )
    order by (shift.id = target_shift_id) desc
    limit 1;

    if audited_shift_id is not null
      and not exists (
        select 1
        from public.audit_events event
        where event.workspace_id = target_workspace_id
          and event.action = 'schedule.soft_conflict_overridden'
          and event.target_type = 'schedule_edit_session_shift'
          and event.target_id = audited_shift_id::text
          and request_idempotency_key is not null
          and event.metadata->>'idempotency_key' = request_idempotency_key::text
      ) then
      insert into public.audit_events (
        workspace_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        target_workspace_id,
        actor_user_id,
        'schedule.soft_conflict_overridden',
        'schedule_edit_session_shift',
        audited_shift_id::text,
        jsonb_build_object(
          'session_id', target_session_id,
          'operation', operation,
          'idempotency_key', request_idempotency_key,
          'note', override_note
        )
      );
    end if;
  end if;

  return result;
end;
$function$;

-- BL-167: the swap review (an open edit, after an approved swap) brings a
-- published shift that is missing from the edit into it. Its note and "hide
-- time on badge" did not come with it (the tags did since BL-158); now they do.
-- A shift that is in the edit keeps the manager's note, tags and hide-time and
-- takes only the swap's who/where/when: shift_exchanges_v1 AT27 "recovery
-- preserves manager note", and shift_exchange_edit_matches, which decides what
-- conflicts with a swap, looks at those fields only.
-- Body is the live definition from 20260926160000; only the insert changed.
CREATE OR REPLACE FUNCTION public.shift_exchange_schedule_recovery_service(actor uuid, w uuid, sid uuid, expected_fingerprint text DEFAULT NULL::text, idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sess public.schedule_edit_sessions%rowtype; ps record; draft public.schedule_edit_session_shifts%rowtype;
 changes jsonb:='[]'; current_shift jsonb; result jsonb; fp text; command jsonb; prior public.shift_exchange_commands%rowtype;
 row_id uuid; edited_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into sess from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if sess.id is null or sess.holder_user_id<>actor then raise exception 'Your edit session was not found' using errcode='42501'; end if;
 if sess.expires_at<=now() then raise exception 'This edit session expired. Reopen it before reviewing assignments' using errcode='PT409'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts d where d.session_id=sid and not public.schedule_actor_can_manage_service(actor,w,d.location_id)) then
  raise exception 'Schedule edit scope required' using errcode='42501';
 end if;
 command:=jsonb_build_object('action','recover_schedule','session_id',sid,'fingerprint',expected_fingerprint);
 if expected_fingerprint is not null then
  if idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
  select * into prior from public.shift_exchange_commands c where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=shift_exchange_schedule_recovery_service.idempotency_key;
  if prior.workspace_id is not null then
   if prior.command is distinct from command then raise exception 'Idempotency key already used' using errcode='22023'; end if;
   return prior.result;
  end if;
 end if;
 for ps in
  select distinct p.* from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  where c.workspace_id=w and c.status='completed' and c.updated_at>sess.created_at
   and p.scheduled_date between sess.week_start and sess.week_start+6
   and exists(select 1 from public.schedule_edit_session_shifts scope where scope.session_id=sid and scope.location_id=p.location_id)
  order by p.id
 loop
  if not public.schedule_actor_can_manage_service(actor,w,ps.location_id) then raise exception 'Schedule edit scope required' using errcode='42501'; end if;
  select * into draft from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if draft.id is not null and draft.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(draft),to_jsonb(ps)) then continue; end if;
  current_shift:=public.shift_exchange_shift(w,ps.id)||jsonb_build_object('shift_type_name',(select name from public.shift_types where id=ps.shift_type_id and workspace_id=w));
  select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) into edited_name from public.employee_profiles where workspace_id=w and id=draft.employee_id;
  changes:=changes||jsonb_build_array(jsonb_build_object('current',current_shift,'session_shift_id',draft.id,'edited_revision',draft.revision,
   'edited_employee_name',edited_name,'edited_start_time',draft.start_time,'edited_end_time',draft.end_time,
   'edited_job_name',(select name from public.jobs where id=draft.job_id and workspace_id=w),
   'edited_shift_type_name',(select name from public.shift_types where id=draft.shift_type_id and workspace_id=w),
   'edited_timezone',draft.time_timezone,'edited_unpaid_break_minutes',draft.unpaid_break_minutes,
   'removed',draft.id is null or draft.pending_op_type='delete'));
 end loop;
 fp:=md5(jsonb_build_object('session_id',sid,'revision',sess.revision,'changes',changes)::text);
 if expected_fingerprint is null then return jsonb_build_object('session_id',sid,'session_revision',sess.revision,'fingerprint',fp,'changes',changes); end if;
 if fp is distinct from expected_fingerprint then raise exception 'Schedule or your edits changed. Review the latest comparison' using errcode='PT409'; end if;
 for current_shift in select x->'current' from jsonb_array_elements(changes) x loop
  select * into ps from public.schedule_published_shifts where workspace_id=w and id=(current_shift->>'id')::uuid;
  select id into row_id from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if row_id is null then
   insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,unpaid_break_minutes,hide_time_on_badge,note,source_published_shift_id,label_ids,label_names)
   values(ps.id,w,sid,ps.location_id,ps.employee_id,ps.job_id,ps.shift_type_id,ps.scheduled_date,ps.start_time,ps.end_time,ps.time_basis,ps.time_snapshot,ps.time_timezone,ps.unpaid_break_minutes,ps.hide_time_on_badge,ps.note,ps.id,ps.label_ids,ps.label_names);
  else
   update public.schedule_edit_session_shifts set location_id=ps.location_id,employee_id=ps.employee_id,job_id=ps.job_id,shift_type_id=ps.shift_type_id,
    scheduled_date=ps.scheduled_date,start_time=ps.start_time,end_time=ps.end_time,time_basis=ps.time_basis,time_snapshot=ps.time_snapshot,time_timezone=ps.time_timezone,
    unpaid_break_minutes=ps.unpaid_break_minutes,source_published_shift_id=ps.id,pending_op_type=null,revision=revision+1,updated_at=now()
    where workspace_id=w and session_id=sid and id=row_id;
  end if;
 end loop;
 if jsonb_array_length(changes)>0 then
  update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=sid;
 end if;
 result:=public.get_schedule_edit_session_service(actor,w,sid);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

