create type public.time_correction_status as enum ('pending', 'accepted', 'rejected');

create table public.time_correction_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  requested_started_at timestamptz not null,
  requested_ended_at timestamptz not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  base_revision integer not null check (base_revision > 0),
  status public.time_correction_status not null default 'pending',
  submitted_by uuid not null references auth.users(id),
  request_idempotency_key uuid not null,
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decision_reason text check (decision_reason is null or char_length(btrim(decision_reason)) between 3 and 500),
  decision_expected_revision integer check (decision_expected_revision is null or decision_expected_revision > 0),
  decision_idempotency_key uuid,
  decided_at timestamptz,
  result_amendment_id uuid references public.time_amendments(id),
  foreign key (session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  unique (workspace_id, submitted_by, request_idempotency_key),
  unique (workspace_id, decided_by, decision_idempotency_key),
  check (requested_ended_at > requested_started_at),
  check (
    (status = 'pending' and decided_by is null and decision_reason is null and decision_idempotency_key is null and decided_at is null and result_amendment_id is null)
    or
    (status in ('accepted', 'rejected') and decided_by is not null and decision_reason is not null and decision_expected_revision is not null and decision_idempotency_key is not null and decided_at is not null)
  ),
  check (status = 'accepted' or result_amendment_id is null)
);

create unique index time_correction_one_pending_session_idx
  on public.time_correction_requests (session_id) where status = 'pending';
create index time_correction_location_queue_idx
  on public.time_correction_requests (workspace_id, location_id, status, submitted_at);

create table public.time_review_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null,
  from_date date not null,
  to_date date not null,
  status text not null default 'approved' check (status = 'approved'),
  session_versions jsonb not null check (jsonb_typeof(session_versions) = 'object' and session_versions <> '{}'::jsonb),
  approved_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  approved_at timestamptz not null default now(),
  foreign key (location_id, workspace_id) references public.locations(id, workspace_id) on delete restrict,
  unique (workspace_id, approved_by, idempotency_key),
  check (to_date >= from_date and to_date - from_date <= 41)
);

alter table public.time_correction_requests enable row level security;
alter table public.time_review_windows enable row level security;
revoke all on public.time_correction_requests, public.time_review_windows from public, anon, authenticated;
grant select, insert, update on public.time_correction_requests to service_role;
grant select, insert on public.time_review_windows to service_role;

create function public.protect_time_correction_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'time correction history is append only' using errcode = '42501';
  end if;
  if old.workspace_id <> new.workspace_id
    or old.session_id <> new.session_id
    or old.employee_id <> new.employee_id
    or old.location_id <> new.location_id
    or old.requested_started_at <> new.requested_started_at
    or old.requested_ended_at <> new.requested_ended_at
    or old.reason <> new.reason
    or old.base_revision <> new.base_revision
    or old.submitted_by <> new.submitted_by
    or old.request_idempotency_key <> new.request_idempotency_key
    or old.submitted_at <> new.submitted_at
    or old.status <> 'pending'
    or new.status = 'pending' then
    raise exception 'time correction request is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_time_correction_history_trigger
before update or delete on public.time_correction_requests
for each row execute function public.protect_time_correction_history();

create trigger protect_time_review_window_trigger
before update or delete on public.time_review_windows
for each row execute function public.prevent_time_history_mutation();

create or replace function public.time_session_detail_json(target_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(session) || jsonb_build_object(
    'location_name', location.name,
    'events', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.occurred_at, event.received_at)
      from public.time_events event where event.session_id = session.id
    ), '[]'::jsonb),
    'amendments', coalesce((
      select jsonb_agg(to_jsonb(amendment) order by amendment.result_revision)
      from public.time_amendments amendment where amendment.session_id = session.id
    ), '[]'::jsonb),
    'correction_requests', coalesce((
      select jsonb_agg(to_jsonb(correction) - 'submitted_by' - 'request_idempotency_key' - 'decision_idempotency_key' order by correction.submitted_at)
      from public.time_correction_requests correction where correction.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.time_sessions session
  join public.locations location on location.id = session.location_id and location.workspace_id = session.workspace_id
  where session.id = target_session_id;
$$;

create or replace function public.manager_time_session_detail_json(target_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(session_row) || jsonb_build_object(
    'employee_name', coalesce(nullif(employee.preferred_name, ''), concat_ws(' ', employee.first_name, employee.last_name)),
    'employee_code', employee.employee_code,
    'location_name', location.name,
    'location_timezone', location.timezone,
    'attention_codes', (
      select coalesce(jsonb_agg(code order by sort_order), '[]'::jsonb) from (
        select 'open_session'::text code, 10 sort_order where session_row.capture_state = 'open'
        union all select 'open_break', 20 where session_row.capture_state = 'on_break'
        union all select 'needs_attention', 30 where session_row.capture_state = 'needs_attention'
        union all select 'overlap', 40 where exists (
          select 1 from public.time_sessions other where other.workspace_id = session_row.workspace_id
          and other.employee_id = session_row.employee_id and other.id <> session_row.id
          and coalesce(other.effective_ended_at, 'infinity'::timestamptz) > session_row.effective_started_at
          and coalesce(session_row.effective_ended_at, 'infinity'::timestamptz) > other.effective_started_at
        )
        union all select 'amended', 50 where exists (select 1 from public.time_amendments amendment where amendment.session_id = session_row.id)
        union all select 'correction_pending', 60 where exists (select 1 from public.time_correction_requests correction where correction.session_id = session_row.id and correction.status = 'pending')
      ) attention
    ),
    'events', (select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.occurred_at, event_row.received_at), '[]'::jsonb) from public.time_events event_row where event_row.session_id = session_row.id),
    'amendments', (select coalesce(jsonb_agg(to_jsonb(amendment_row) order by amendment_row.result_revision), '[]'::jsonb) from public.time_amendments amendment_row where amendment_row.session_id = session_row.id),
    'manual_entry', (select to_jsonb(manual_row) from public.time_manual_entries manual_row where manual_row.session_id = session_row.id),
    'correction_requests', (select coalesce(jsonb_agg(to_jsonb(correction) - 'submitted_by' - 'request_idempotency_key' - 'decision_idempotency_key' order by correction.submitted_at), '[]'::jsonb) from public.time_correction_requests correction where correction.session_id = session_row.id)
  )
  from public.time_sessions session_row
  join public.employee_profiles employee on employee.id = session_row.employee_id and employee.workspace_id = session_row.workspace_id
  join public.locations location on location.id = session_row.location_id and location.workspace_id = session_row.workspace_id
  where session_row.id = target_session_id;
$$;

create or replace function public.get_manager_time_entries_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if target_from is null or target_to is null or target_to < target_from then raise exception 'valid time entry range required' using errcode = '22023'; end if;
  if target_to - target_from > 41 then raise exception 'time entry range cannot exceed 42 days' using errcode = '22023'; end if;
  if not exists (select 1 from public.locations location where location.workspace_id = target_workspace_id and location.archived_at is null and public.service_actor_can_time_location(actor_user_id,target_workspace_id,location.id,'time.read.location')) then raise exception 'location time read denied' using errcode = '42501'; end if;
  select jsonb_build_object(
    'workspace_id',target_workspace_id,'from',target_from,'to',target_to,
    'locations',(select coalesce(jsonb_agg(jsonb_build_object('id',location.id,'name',location.name,'timezone',location.timezone) order by location.sort_order,location.name),'[]'::jsonb) from public.locations location where location.workspace_id=target_workspace_id and location.archived_at is null and public.service_actor_can_time_location(actor_user_id,target_workspace_id,location.id,'time.read.location')),
    'employees',(select coalesce(jsonb_agg(employee_json order by employee_name),'[]'::jsonb) from (select coalesce(nullif(employee.preferred_name,''),concat_ws(' ',employee.first_name,employee.last_name)) employee_name,jsonb_build_object('id',employee.id,'employee_code',employee.employee_code,'display_name',coalesce(nullif(employee.preferred_name,''),concat_ws(' ',employee.first_name,employee.last_name)),'location_ids',jsonb_agg(assignment.location_id order by assignment.location_id)) employee_json from public.employee_profiles employee join public.employee_location_assignments assignment on assignment.workspace_id=employee.workspace_id and assignment.employee_id=employee.id and assignment.ended_at is null join public.locations location on location.id=assignment.location_id and location.workspace_id=assignment.workspace_id and location.archived_at is null where employee.workspace_id=target_workspace_id and employee.archived_at is null and public.service_actor_can_time_location(actor_user_id,target_workspace_id,location.id,'time.read.location') group by employee.id) employee_rows),
    'sessions',(select coalesce(jsonb_agg(detail order by started_at desc),'[]'::jsonb) from (select session_row.started_at,public.manager_time_session_detail_json(session_row.id) detail from public.time_sessions session_row join public.locations location on location.id=session_row.location_id and location.workspace_id=session_row.workspace_id where session_row.workspace_id=target_workspace_id and (session_row.started_at at time zone location.timezone)::date between target_from and target_to and public.service_actor_can_time_location(actor_user_id,target_workspace_id,session_row.location_id,'time.read.location') order by session_row.started_at desc limit 500) session_rows),
    'review_windows',(select coalesce(jsonb_agg(to_jsonb(review_window)-'idempotency_key' order by review_window.approved_at desc),'[]'::jsonb) from public.time_review_windows review_window where review_window.workspace_id=target_workspace_id and review_window.to_date>=target_from and review_window.from_date<=target_to and public.service_actor_can_time_location(actor_user_id,target_workspace_id,review_window.location_id,'time.read.location'))
  ) into result;
  return result;
end;
$$;

create function public.request_own_time_correction_service(actor_user_id uuid,target_workspace_id uuid,target_session_id uuid,target_expected_revision integer,target_requested_started_at timestamptz,target_requested_ended_at timestamptz,target_reason text,target_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare employee_row public.employee_profiles%rowtype; session_row public.time_sessions%rowtype; correction_row public.time_correction_requests%rowtype;
begin
  if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'time.correction.request.own') then raise exception 'own time correction denied' using errcode='42501'; end if;
  select * into employee_row from public.employee_profiles where workspace_id=target_workspace_id and user_id=actor_user_id and archived_at is null;
  if not found then raise exception 'employee profile required' using errcode='42501'; end if;
  select * into correction_row from public.time_correction_requests where workspace_id=target_workspace_id and submitted_by=actor_user_id and request_idempotency_key=target_idempotency_key;
  if found then
    if correction_row.session_id<>target_session_id or correction_row.base_revision<>target_expected_revision or correction_row.requested_started_at<>target_requested_started_at or correction_row.requested_ended_at<>target_requested_ended_at or correction_row.reason<>btrim(target_reason) then raise exception 'idempotency key payload conflict' using errcode='23505'; end if;
    select * into session_row from public.time_sessions where id=correction_row.session_id;
    return jsonb_build_object('correction',to_jsonb(correction_row)-'submitted_by'-'request_idempotency_key'-'decision_idempotency_key','amendment',null,'session',to_jsonb(session_row),'idempotent_replay',true);
  end if;
  select * into session_row from public.time_sessions where id=target_session_id and workspace_id=target_workspace_id and employee_id=employee_row.id for update;
  if not found then raise exception 'time session not found' using errcode='P0002'; end if;
  if session_row.capture_state<>'complete' then raise exception 'only complete sessions can be corrected' using errcode='23514'; end if;
  if session_row.revision<>target_expected_revision then raise exception 'stale time session revision' using errcode='40001'; end if;
  if target_requested_ended_at<=target_requested_started_at then raise exception 'requested end must follow start' using errcode='22023'; end if;
  if char_length(btrim(target_reason)) not between 3 and 500 then raise exception 'correction reason must be between 3 and 500 characters' using errcode='22023'; end if;
  insert into public.time_correction_requests(workspace_id,session_id,employee_id,location_id,requested_started_at,requested_ended_at,reason,base_revision,submitted_by,request_idempotency_key)
  values(target_workspace_id,session_row.id,session_row.employee_id,session_row.location_id,target_requested_started_at,target_requested_ended_at,btrim(target_reason),target_expected_revision,actor_user_id,target_idempotency_key) returning * into correction_row;
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
  select target_workspace_id,membership.user_id,'request','Time correction requested',coalesce(nullif(employee_row.preferred_name,''),employee_row.first_name)||' requested a time correction.','/app/time-entries','time_correction',correction_row.id,'submitted'
  from public.workspace_memberships membership join public.workspace_role_permissions permission on permission.workspace_id=membership.workspace_id and permission.role_id=membership.role_id
  where membership.workspace_id=target_workspace_id and membership.status='active' and permission.permission_key='time.correction.review.location' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=session_row.location_id))
  on conflict do nothing;
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'time.correction_requested','time_correction',correction_row.id::text,jsonb_build_object('session_id',session_row.id,'base_revision',target_expected_revision));
  return jsonb_build_object('correction',to_jsonb(correction_row)-'submitted_by'-'request_idempotency_key'-'decision_idempotency_key','amendment',null,'session',to_jsonb(session_row),'idempotent_replay',false);
end;
$$;

create function public.decide_time_correction_service(actor_user_id uuid,target_workspace_id uuid,target_correction_id uuid,target_expected_session_revision integer,target_action text,target_reason text,target_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare correction_row public.time_correction_requests%rowtype; session_row public.time_sessions%rowtype; amendment_row public.time_amendments%rowtype; employee_user_id uuid;
begin
  select * into correction_row from public.time_correction_requests where workspace_id=target_workspace_id and decided_by=actor_user_id and decision_idempotency_key=target_idempotency_key;
  if found then
    if correction_row.id<>target_correction_id or correction_row.decision_expected_revision<>target_expected_session_revision or (case correction_row.status when 'accepted' then 'accept' else 'reject' end)<>target_action or correction_row.decision_reason<>btrim(target_reason) then raise exception 'idempotency key payload conflict' using errcode='23505'; end if;
    select * into session_row from public.time_sessions where id=correction_row.session_id;
    select * into amendment_row from public.time_amendments where id=correction_row.result_amendment_id;
    return jsonb_build_object('correction',to_jsonb(correction_row)-'submitted_by'-'request_idempotency_key'-'decision_idempotency_key','amendment',case when amendment_row.id is null then null else to_jsonb(amendment_row) end,'session',to_jsonb(session_row),'idempotent_replay',true);
  end if;
  select * into correction_row from public.time_correction_requests where id=target_correction_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'time correction not found' using errcode='P0002'; end if;
  if not public.service_actor_can_time_location(actor_user_id,target_workspace_id,correction_row.location_id,'time.correction.review.location') then raise exception 'time correction review denied' using errcode='42501'; end if;
  if correction_row.status<>'pending' then raise exception 'time correction no longer pending' using errcode='23505'; end if;
  if target_action not in('accept','reject') or char_length(btrim(target_reason)) not between 3 and 500 then raise exception 'valid correction decision required' using errcode='22023'; end if;
  select * into session_row from public.time_sessions where id=correction_row.session_id for update;
  if session_row.revision<>target_expected_session_revision or correction_row.base_revision<>session_row.revision then raise exception 'stale time session revision' using errcode='40001'; end if;
  if target_action='accept' then
    insert into public.time_amendments(workspace_id,session_id,employee_id,location_id,actor_user_id,reason,before_started_at,before_ended_at,after_started_at,after_ended_at,base_revision,result_revision,idempotency_key)
    values(target_workspace_id,session_row.id,session_row.employee_id,session_row.location_id,actor_user_id,btrim(target_reason),session_row.effective_started_at,session_row.effective_ended_at,correction_row.requested_started_at,correction_row.requested_ended_at,session_row.revision,session_row.revision+1,target_idempotency_key) returning * into amendment_row;
    update public.time_sessions set effective_started_at=correction_row.requested_started_at,effective_ended_at=correction_row.requested_ended_at,revision=revision+1,review_state=case when review_state='approved' then 'reopened' else review_state end,updated_at=now() where id=session_row.id returning * into session_row;
  end if;
  update public.time_correction_requests set status=case when target_action='accept' then 'accepted'::public.time_correction_status else 'rejected'::public.time_correction_status end,decided_by=actor_user_id,decision_reason=btrim(target_reason),decision_expected_revision=target_expected_session_revision,decision_idempotency_key=target_idempotency_key,decided_at=now(),result_amendment_id=amendment_row.id where id=correction_row.id returning * into correction_row;
  select user_id into employee_user_id from public.employee_profiles where id=correction_row.employee_id;
  if employee_user_id is not null then insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key) values(target_workspace_id,employee_user_id,'request',case when target_action='accept' then 'Time correction accepted' else 'Time correction declined' end,btrim(target_reason),'/app/employee-hub?tab=time','time_correction',correction_row.id,'decided') on conflict do nothing; end if;
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'time.correction_'||correction_row.status::text,'time_correction',correction_row.id::text,jsonb_build_object('session_id',session_row.id,'revision',session_row.revision));
  return jsonb_build_object('correction',to_jsonb(correction_row)-'submitted_by'-'request_idempotency_key'-'decision_idempotency_key','amendment',case when amendment_row.id is null then null else to_jsonb(amendment_row) end,'session',to_jsonb(session_row),'idempotent_replay',false);
end;
$$;

create function public.approve_time_review_window_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,target_from date,target_to date,target_sessions jsonb,target_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare window_row public.time_review_windows%rowtype; actual_versions jsonb; supplied_versions jsonb; approved_count integer; existing_window boolean;
begin
  if not public.service_actor_can_time_location(actor_user_id,target_workspace_id,target_location_id,'time.review.approve.location') then raise exception 'time review approval denied' using errcode='42501'; end if;
  if target_from is null or target_to<target_from or target_to-target_from>41 then raise exception 'valid review window required' using errcode='22023'; end if;
  select * into window_row from public.time_review_windows where workspace_id=target_workspace_id and approved_by=actor_user_id and idempotency_key=target_idempotency_key;
  existing_window := found;
  select coalesce(jsonb_object_agg(item->>'session_id',(item->>'expected_revision')::integer),'{}'::jsonb) into supplied_versions from jsonb_array_elements(target_sessions) item;
  if existing_window then
    if window_row.location_id<>target_location_id or window_row.from_date<>target_from or window_row.to_date<>target_to or window_row.session_versions<>supplied_versions then raise exception 'idempotency key payload conflict' using errcode='23505'; end if;
    select count(*) into approved_count from jsonb_object_keys(window_row.session_versions);
    return jsonb_build_object('window',to_jsonb(window_row)-'idempotency_key','approved_session_count',approved_count,'idempotent_replay',true);
  end if;
  select coalesce(jsonb_object_agg(session.id::text,session.revision),'{}'::jsonb) into actual_versions from public.time_sessions session join public.locations location on location.id=session.location_id and location.workspace_id=session.workspace_id where session.workspace_id=target_workspace_id and session.location_id=target_location_id and session.capture_state='complete' and session.review_state<>'approved' and (session.started_at at time zone location.timezone)::date between target_from and target_to and not exists(select 1 from public.time_correction_requests correction where correction.session_id=session.id and correction.status='pending');
  if actual_versions='{}'::jsonb then raise exception 'no reviewable time sessions' using errcode='23514'; end if;
  if actual_versions<>supplied_versions then raise exception 'stale review window sessions' using errcode='40001'; end if;
  update public.time_sessions set review_state='approved',updated_at=now() where id in(select key::uuid from jsonb_each(actual_versions)); get diagnostics approved_count=row_count;
  insert into public.time_review_windows(workspace_id,location_id,from_date,to_date,session_versions,approved_by,idempotency_key) values(target_workspace_id,target_location_id,target_from,target_to,actual_versions,actor_user_id,target_idempotency_key) returning * into window_row;
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'time.review_window_approved','time_review_window',window_row.id::text,jsonb_build_object('location_id',target_location_id,'from',target_from,'to',target_to,'session_count',approved_count));
  return jsonb_build_object('window',to_jsonb(window_row)-'idempotency_key','approved_session_count',approved_count,'idempotent_replay',false);
end;
$$;

revoke all on function public.request_own_time_correction_service(uuid,uuid,uuid,integer,timestamptz,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.decide_time_correction_service(uuid,uuid,uuid,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function public.approve_time_review_window_service(uuid,uuid,uuid,date,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.request_own_time_correction_service(uuid,uuid,uuid,integer,timestamptz,timestamptz,text,uuid) to service_role;
grant execute on function public.decide_time_correction_service(uuid,uuid,uuid,integer,text,text,uuid) to service_role;
grant execute on function public.approve_time_review_window_service(uuid,uuid,uuid,date,date,jsonb,uuid) to service_role;
