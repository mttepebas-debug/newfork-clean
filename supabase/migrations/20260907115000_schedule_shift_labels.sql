alter table public.schedule_published_shifts
  add column if not exists label_ids uuid[] not null default '{}',
  add column if not exists label_names text[] not null default '{}';

alter table public.schedule_draft_shifts
  add column if not exists label_ids uuid[] not null default '{}',
  add column if not exists label_names text[] not null default '{}';

alter table public.schedule_edit_session_shifts
  add column if not exists label_ids uuid[] not null default '{}',
  add column if not exists label_names text[] not null default '{}';

alter table public.schedule_template_shifts
  add column if not exists label_ids uuid[] not null default '{}',
  add column if not exists label_names text[] not null default '{}';

alter function public.get_schedule_read_model_service(uuid, uuid, date)
rename to get_schedule_read_model_service_label_base;

create function public.get_schedule_read_model_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  patched_shifts jsonb;
begin
  base := public.get_schedule_read_model_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_date
  );

  select coalesce(jsonb_agg(
    item.value
      || jsonb_build_object(
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
      )
    order by item.ordinality
  ), '[]'::jsonb)
  into patched_shifts
  from jsonb_array_elements(base->'shifts') with ordinality item(value, ordinality)
  left join public.schedule_published_shifts shift
    on shift.id = (item.value->>'id')::uuid
   and shift.workspace_id = target_workspace_id;

  return jsonb_set(
    jsonb_set(base, '{shift_labels}', coalesce(base->'shift_labels', '[]'::jsonb), true),
    '{shifts}',
    patched_shifts,
    true
  );
end;
$$;

alter function public.get_schedule_edit_session_service(uuid, uuid, uuid)
rename to get_schedule_edit_session_service_label_base;

create function public.get_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  patched_shifts jsonb;
begin
  base := public.get_schedule_edit_session_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_session_id
  );

  select coalesce(jsonb_agg(
    item.value
      || jsonb_build_object(
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
      )
    order by item.ordinality
  ), '[]'::jsonb)
  into patched_shifts
  from jsonb_array_elements(base->'shifts') with ordinality item(value, ordinality)
  left join public.schedule_edit_session_shifts shift
    on shift.session_id = target_session_id
   and shift.id = (item.value->>'id')::uuid;

  return jsonb_set(base, '{shifts}', patched_shifts, true);
end;
$$;

alter function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) rename to mutate_schedule_edit_shift_service_label_base;

create function public.mutate_schedule_edit_shift_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  operation text,
  target_shift_id uuid,
  expected_shift_revision integer default null,
  shift_payload jsonb default null,
  request_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.mutate_schedule_edit_shift_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    operation,
    target_shift_id,
    expected_shift_revision,
    shift_payload,
    request_idempotency_key
  );

  if operation in ('create', 'update') and shift_payload is not null then
    update public.schedule_edit_session_shifts shift
       set label_ids = coalesce(
             array(select jsonb_array_elements_text(coalesce(shift_payload->'label_ids', '[]'::jsonb))::uuid),
             '{}'::uuid[]
           ),
           label_names = coalesce(
             array(select jsonb_array_elements_text(coalesce(shift_payload->'label_names', '[]'::jsonb))),
             '{}'::text[]
           )
     where shift.session_id = target_session_id
       and shift.id = target_shift_id
       and shift.workspace_id = target_workspace_id;

    if found then
      return public.get_schedule_edit_session_service(
        actor_user_id,
        target_workspace_id,
        target_session_id
      );
    end if;
  end if;

  return result;
end;
$$;

alter function public.save_schedule_edit_session_service(
  uuid, uuid, uuid, integer, text, uuid, integer
) rename to save_schedule_edit_session_service_label_base;

create function public.save_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  saved_draft_id uuid;
  session_labels jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', shift.id,
    'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
  )), '[]'::jsonb)
  into session_labels
  from public.schedule_edit_session_shifts shift
  join public.schedule_edit_sessions session
    on session.id = shift.session_id
   and session.workspace_id = shift.workspace_id
  where shift.session_id = target_session_id
    and shift.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;

  result := public.save_schedule_edit_session_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    target_name,
    target_draft_id,
    expected_draft_revision
  );
  saved_draft_id := (result->>'id')::uuid;

  update public.schedule_draft_shifts draft_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from jsonb_to_recordset(session_labels) as label_row(
      id uuid,
      label_ids uuid[],
      label_names text[]
    )
   where draft_shift.draft_id = saved_draft_id
     and draft_shift.id = label_row.id
     and draft_shift.workspace_id = target_workspace_id;

  return result;
end;
$$;

alter function public.publish_schedule_draft_service(
  uuid, uuid, uuid, uuid[], integer, text, jsonb
) rename to publish_schedule_draft_service_label_base;

create function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.publish_schedule_draft_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    target_location_ids,
    expected_draft_revision,
    expected_fingerprint,
    override_decisions
  );

  update public.schedule_published_shifts published_shift
     set label_ids = coalesce(draft_shift.label_ids, '{}'::uuid[]),
         label_names = coalesce(draft_shift.label_names, '{}'::text[])
    from public.schedule_draft_shifts draft_shift
   where published_shift.workspace_id = target_workspace_id
     and published_shift.source_shift_id = draft_shift.id
     and draft_shift.draft_id = target_draft_id
     and published_shift.publication_id = any(
       array(select jsonb_array_elements_text(result->'publication_ids')::uuid)
     );

  return result;
end;
$$;

create or replace function public.get_schedule_template_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_template_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 select jsonb_build_object('template',jsonb_build_object('id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'hide_time_on_badge',coalesce(s.hide_time_on_badge,false),'label_ids',to_jsonb(coalesce(s.label_ids,'{}'::uuid[])),
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $$;

alter function public.create_schedule_template_service(uuid, uuid, uuid, text, boolean)
rename to create_schedule_template_service_label_base;

create or replace function public.create_schedule_template_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_name text,
  strip_assignments boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  result jsonb;
  created_template_id uuid;
  draft_labels jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinality', row_number,
    'label_ids', to_jsonb(coalesce(label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(label_names, '{}'::text[]))
  ) order by row_number), '[]'::jsonb)
  into draft_labels
  from (
    select s.label_ids, s.label_names,
           row_number() over (order by (s.scheduled_date - d.week_start), s.start_time, s.id) as row_number
    from public.schedule_draft_shifts s
    join public.schedule_drafts d on d.id = s.draft_id
    where s.draft_id = target_draft_id
      and s.workspace_id = target_workspace_id
  ) ordered;

  result := public.create_schedule_template_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    target_name,
    strip_assignments
  );
  created_template_id := (result->'template'->>'id')::uuid;

  update public.schedule_template_shifts template_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from (
      select s.id,
             row_number() over (order by s.day_offset, s.start_time, s.id) as row_number
      from public.schedule_template_shifts s
      where s.template_id = created_template_id
    ) template_order
    join jsonb_to_recordset(draft_labels) as label_row(
      ordinality bigint,
      label_ids uuid[],
      label_names text[]
    ) on label_row.ordinality = template_order.row_number
   where template_shift.id = template_order.id
     and template_shift.template_id = created_template_id;

  return public.get_schedule_template_service(actor_user_id, target_workspace_id, created_template_id);
end;
$$;

alter function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text)
rename to apply_schedule_template_service_label_base;

create function public.apply_schedule_template_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_template_id uuid,
  apply_mode text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  result jsonb;
  template_labels jsonb;
  existing_shift_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into existing_shift_ids
  from public.schedule_edit_session_shifts
  where session_id = target_session_id
    and workspace_id = target_workspace_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinality', row_number,
    'label_ids', to_jsonb(coalesce(label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(label_names, '{}'::text[]))
  ) order by row_number), '[]'::jsonb)
  into template_labels
  from (
    select s.label_ids, s.label_names,
           row_number() over (order by s.day_offset, s.start_time, s.id) as row_number
    from public.schedule_template_shifts s
    where s.template_id = target_template_id
      and s.workspace_id = target_workspace_id
  ) ordered;

  result := public.apply_schedule_template_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    target_template_id,
    apply_mode
  );

  update public.schedule_edit_session_shifts session_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from (
      select s.id,
             row_number() over (order by s.created_at, s.scheduled_date, s.start_time, s.id) as row_number
      from public.schedule_edit_session_shifts s
      where s.session_id = target_session_id
        and s.workspace_id = target_workspace_id
        and (
          apply_mode = 'overwrite'
          or not (s.id = any(existing_shift_ids))
        )
    ) session_order
    join jsonb_to_recordset(template_labels) as label_row(
      ordinality bigint,
      label_ids uuid[],
      label_names text[]
    ) on label_row.ordinality = session_order.row_number
   where session_shift.session_id = target_session_id
     and session_shift.id = session_order.id;

  return jsonb_set(
    result,
    '{session}',
    public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id),
    true
  );
end;
$$;

create or replace function public.schedule_pending_op_payload_json(
  target_shift public.schedule_edit_session_shifts
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'scheduled_date', target_shift.scheduled_date,
    'start_time', to_char(target_shift.start_time, 'HH24:MI'),
    'end_time', to_char(target_shift.end_time, 'HH24:MI'),
    'unpaid_break_minutes', coalesce(target_shift.unpaid_break_minutes, 0),
    'location_id', target_shift.location_id,
    'employee_id', target_shift.employee_id,
    'job_id', target_shift.job_id,
    'shift_type_id', target_shift.shift_type_id,
    'source_published_shift_id', target_shift.source_published_shift_id,
    'label_ids', to_jsonb(coalesce(target_shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(target_shift.label_names, '{}'::text[])),
    'note', target_shift.note
  ));
$$;

revoke all on function public.get_schedule_read_model_service(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.get_schedule_edit_session_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_schedule_template_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_schedule_template_service(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.schedule_pending_op_payload_json(public.schedule_edit_session_shifts) from public, anon, authenticated;

grant execute on function public.get_schedule_read_model_service(uuid, uuid, date) to service_role;
grant execute on function public.get_schedule_edit_session_service(uuid, uuid, uuid) to service_role;
grant execute on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid) to service_role;
grant execute on function public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer) to service_role;
grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb) to service_role;
grant execute on function public.get_schedule_template_service(uuid, uuid, uuid) to service_role;
grant execute on function public.create_schedule_template_service(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.schedule_pending_op_payload_json(public.schedule_edit_session_shifts) to service_role;
