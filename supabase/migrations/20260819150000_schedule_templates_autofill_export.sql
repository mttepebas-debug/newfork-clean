insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('schedule.templates.manage', 'Manage schedule templates', 'Schedule', 'Create and apply reusable schedule templates.', true, 46),
  ('schedule.export', 'Export schedules', 'Schedule', 'Preview and export schedule-only data.', true, 47)
on conflict (key) do update set label=excluded.label, category=excluded.category,
  description=excluded.description, custom_grantable=excluded.custom_grantable,
  sort_order=excluded.sort_order;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (values ('schedule.templates.manage'), ('schedule.export')) permission(key)
where role.system_key in ('owner', 'admin', 'manager')
on conflict do nothing;

create or replace function public.initialize_workspace_roles(target_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_role_id uuid; admin_role_id uuid; manager_role_id uuid; employee_role_id uuid;
begin
  insert into public.workspace_roles (workspace_id,name,description,system_key,access_class,sort_order)
  values
    (target_workspace_id,'Owner','Full workspace authority and ownership protection.','owner','owner',0),
    (target_workspace_id,'Admin','Workspace administration without ownership transfer.','admin','admin',10),
    (target_workspace_id,'Manager','Schedule operations for assigned locations.','manager','manager',20),
    (target_workspace_id,'Employee','Personal workspace and published schedule access.','employee','employee',30)
  on conflict do nothing;
  select id into owner_role_id from public.workspace_roles where workspace_id=target_workspace_id and system_key='owner';
  select id into admin_role_id from public.workspace_roles where workspace_id=target_workspace_id and system_key='admin';
  select id into manager_role_id from public.workspace_roles where workspace_id=target_workspace_id and system_key='manager';
  select id into employee_role_id from public.workspace_roles where workspace_id=target_workspace_id and system_key='employee';
  insert into public.workspace_role_permissions select target_workspace_id,owner_role_id,key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions select target_workspace_id,admin_role_id,key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id,role_id,permission_key) values
    (target_workspace_id,manager_role_id,'workspace.read'),
    (target_workspace_id,manager_role_id,'schedule.read'),
    (target_workspace_id,manager_role_id,'schedule.manage'),
    (target_workspace_id,manager_role_id,'schedule.publish'),
    (target_workspace_id,manager_role_id,'schedule.templates.manage'),
    (target_workspace_id,manager_role_id,'schedule.export'),
    (target_workspace_id,manager_role_id,'employees.read'),
    (target_workspace_id,manager_role_id,'employees.manage'),
    (target_workspace_id,manager_role_id,'employee_onboarding.review'),
    (target_workspace_id,employee_role_id,'workspace.read'),
    (target_workspace_id,employee_role_id,'schedule.read')
  on conflict do nothing;
end; $$;

create or replace function public.enforce_role_permission_dependencies()
returns trigger language plpgsql security definer set search_path = '' as $$
declare checked_role_id uuid := coalesce(new.role_id, old.role_id);
begin
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage')
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then
    raise exception 'schedule.manage requires schedule.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in ('schedule.publish','schedule.templates.manage'))
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage') then
    raise exception 'schedule publication and templates require schedule.manage' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.export')
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then
    raise exception 'schedule.export requires schedule.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.manage')
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read') then
    raise exception 'documents.manage requires documents.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.manage')
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.read') then
    raise exception 'signature_templates.manage requires signature_templates.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in ('employees.manage','employees.archive'))
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then
    raise exception 'employee management requires employees.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_access.manage')
    and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read')
      or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='roles.read')) then
    raise exception 'employee_access.manage requires employees.read and roles.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review')
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then
    raise exception 'employee onboarding review requires employees.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_documents.review')
    and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review')
      or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read')) then
    raise exception 'employee document review requires onboarding review and documents.read' using errcode='23514'; end if;
  return null;
end; $$;

create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 80), revision integer not null default 1 check(revision>0),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,workspace_id)
);
create unique index schedule_templates_name_idx on public.schedule_templates(workspace_id,lower(btrim(name)));
create table public.schedule_template_shifts (
  id uuid not null default gen_random_uuid(), workspace_id uuid not null, template_id uuid not null,
  location_id uuid not null, employee_id uuid, job_id uuid not null, shift_type_id uuid,
  day_offset integer not null check(day_offset between 0 and 6), start_time time not null, end_time time not null,
  crosses_midnight boolean generated always as (end_time<=start_time) stored,
  note text not null default '' check(char_length(note)<=500), primary key(template_id,id),
  foreign key(template_id,workspace_id) references public.schedule_templates(id,workspace_id) on delete cascade,
  foreign key(location_id,workspace_id) references public.locations(id,workspace_id) on delete restrict,
  foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete restrict,
  foreign key(job_id,workspace_id) references public.jobs(id,workspace_id) on delete restrict,
  foreign key(shift_type_id,workspace_id) references public.shift_types(id,workspace_id) on delete restrict,
  check(start_time<>end_time)
);
create table public.schedule_export_presets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 80), settings jsonb not null check(jsonb_typeof(settings)='object'),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,workspace_id)
);
create unique index schedule_export_presets_name_idx on public.schedule_export_presets(workspace_id,created_by,lower(btrim(name)));
create type public.schedule_template_event_action as enum ('created','renamed','deleted','applied');
create table public.schedule_template_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null, template_name text not null, action public.schedule_template_event_action not null,
  actor_user_id uuid not null references auth.users(id), session_id uuid, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.schedule_templates enable row level security;
alter table public.schedule_template_shifts enable row level security;
alter table public.schedule_export_presets enable row level security;
alter table public.schedule_template_events enable row level security;
revoke all on public.schedule_templates,public.schedule_template_shifts,public.schedule_export_presets,public.schedule_template_events from public,anon,authenticated;
grant select on public.schedule_templates,public.schedule_template_shifts,public.schedule_export_presets,public.schedule_template_events to service_role;

create function public.schedule_actor_has_capability_service(actor_user_id uuid,target_workspace_id uuid,capability text,target_location_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
 join public.workspace_role_permissions p on p.role_id=r.id and p.workspace_id=r.workspace_id
 where m.workspace_id=target_workspace_id and m.user_id=actor_user_id and m.status='active' and r.access_class in ('owner','admin','manager')
 and p.permission_key=capability and (target_location_id is null or m.all_locations or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=target_workspace_id and s.location_id=target_location_id)));
$$;

create function public.list_schedule_templates_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('templates',coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',x.shift_count,'open_slot_count',x.open_slot_count,
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at
 ) order by t.updated_at desc,t.id) filter(where t.id is not null),'[]'::jsonb))
 from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select count(*)::integer shift_count,count(*) filter(where s.employee_id is null)::integer open_slot_count from public.schedule_template_shifts s where s.template_id=t.id) x
 where t.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id));
$$;

create function public.get_schedule_template_service(actor_user_id uuid,target_workspace_id uuid,target_template_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('template',jsonb_build_object('id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $$;

create function public.create_schedule_template_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_name text,strip_assignments boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.schedule_drafts%rowtype; new_template public.schedule_templates%rowtype;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template access denied' using errcode='42501'; end if;
 select * into d from public.schedule_drafts where id=target_draft_id and workspace_id=target_workspace_id and archived_at is null;
 if d.id is null then raise exception 'schedule draft not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.schedule_draft_shifts where draft_id=d.id) then raise exception 'schedule template source is empty' using errcode='22023'; end if;
 if exists(select 1 from public.schedule_draft_shifts s where s.draft_id=d.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id)) then raise exception 'schedule template scope denied' using errcode='42501'; end if;
 insert into public.schedule_templates(workspace_id,name,created_by,updated_by) values(target_workspace_id,btrim(target_name),actor_user_id,actor_user_id) returning * into new_template;
 insert into public.schedule_template_shifts(workspace_id,template_id,location_id,employee_id,job_id,shift_type_id,day_offset,start_time,end_time,note)
 select s.workspace_id,new_template.id,s.location_id,case when strip_assignments then null else s.employee_id end,s.job_id,s.shift_type_id,(s.scheduled_date-d.week_start),s.start_time,s.end_time,s.note
 from public.schedule_draft_shifts s where s.draft_id=d.id;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,new_template.id,new_template.name,'created',actor_user_id,jsonb_build_object('source_draft_id',d.id,'strip_assignments',strip_assignments));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,new_template.id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end; $$;

create function public.rename_schedule_template_service(actor_user_id uuid,target_workspace_id uuid,target_template_id uuid,target_name text,expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_name text;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template access denied' using errcode='42501'; end if;
 select name into old_name from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id;
 update public.schedule_templates set name=btrim(target_name),revision=revision+1,updated_by=actor_user_id,updated_at=now()
 where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision;
 if not found then raise exception 'schedule template revision stale' using errcode='40001'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,target_template_id,btrim(target_name),'renamed',actor_user_id,jsonb_build_object('previous_name',old_name));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,target_template_id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end; $$;

create function public.delete_schedule_template_service(actor_user_id uuid,target_workspace_id uuid,target_template_id uuid,expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_name text;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template access denied' using errcode='42501'; end if;
 delete from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision returning name into old_name;
 if old_name is null then raise exception 'schedule template revision stale' using errcode='40001'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id) values(target_workspace_id,target_template_id,old_name,'deleted',actor_user_id);
 return jsonb_build_object('status','deleted','template_id',target_template_id);
end; $$;

create function public.apply_schedule_template_service(actor_user_id uuid,target_workspace_id uuid,target_session_id uuid,expected_session_revision integer,target_template_id uuid,apply_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_session public.schedule_edit_sessions%rowtype; template_row public.schedule_templates%rowtype; source record;
  applied_count integer:=0; converted_count integer:=0; chosen_employee uuid;
  target_date date; target_end_date date;
begin
  if apply_mode not in ('merge','overwrite') then raise exception 'invalid template apply mode' using errcode='22023'; end if;
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id for update;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  if target_session.revision<>expected_session_revision then raise exception 'session revision stale' using errcode='40001'; end if;
  select * into template_row from public.schedule_templates t where t.id=target_template_id and t.workspace_id=target_workspace_id;
  if template_row.id is null or not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template not found' using errcode='P0002'; end if;
  if exists(select 1 from public.schedule_template_shifts s left join public.locations l on l.id=s.location_id and l.workspace_id=s.workspace_id and l.archived_at is null
    left join public.jobs j on j.id=s.job_id and j.workspace_id=s.workspace_id and j.archived_at is null
    left join public.shift_types st on st.id=s.shift_type_id and st.workspace_id=s.workspace_id and st.archived_at is null
    where s.template_id=template_row.id and (l.id is null or j.id is null or (s.shift_type_id is not null and st.id is null)
      or not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id))) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode='23503'; end if;
  if apply_mode='overwrite' then delete from public.schedule_edit_session_shifts where session_id=target_session.id; end if;
  for source in select * from public.schedule_template_shifts where template_id=template_row.id order by day_offset,start_time,id loop
    target_date:=target_session.week_start+source.day_offset; target_end_date:=target_date+case when source.end_time<=source.start_time then 1 else 0 end;
    chosen_employee:=source.employee_id;
    if chosen_employee is not null and (not exists(select 1 from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=source.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=source.job_id and ja.ended_at is null
      where e.id=chosen_employee and e.workspace_id=target_workspace_id and e.archived_at is null)
      or exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=chosen_employee
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
         && tsrange(target_date+source.start_time,target_end_date+source.end_time,'[)'))) then
      chosen_employee:=null; converted_count:=converted_count+1;
    end if;
    insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note)
    values(gen_random_uuid(),target_workspace_id,target_session.id,source.location_id,chosen_employee,source.job_id,source.shift_type_id,target_date,source.start_time,source.end_time,source.note);
    applied_count:=applied_count+1;
  end loop;
  update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=target_session.id;
  insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,session_id,detail)
  values(target_workspace_id,template_row.id,template_row.name,'applied',actor_user_id,target_session.id,jsonb_build_object('mode',apply_mode,'applied_shift_count',applied_count,'converted_open_count',converted_count));
  return jsonb_build_object('status','applied','mode',apply_mode,'applied_shift_count',applied_count,'converted_open_count',converted_count,
    'session',public.get_schedule_edit_session_service(actor_user_id,target_workspace_id,target_session.id));
end; $$;

create function public.preview_schedule_auto_fill_service(actor_user_id uuid,target_workspace_id uuid,target_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target_session public.schedule_edit_sessions%rowtype; open_shift record; candidate_payload jsonb; recommended uuid;
  proposals jsonb:='[]'::jsonb; unfilled jsonb:='[]'::jsonb; unsigned jsonb;
begin
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id or not public.schedule_actor_can_manage_service(actor_user_id,target_workspace_id) then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  for open_shift in select s.*,l.name location_name,j.name job_name from public.schedule_edit_session_shifts s
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    where s.session_id=target_session.id and s.employee_id is null order by s.scheduled_date,s.start_time,s.id loop
    with eligible as (
      select e.id employee_id,coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) employee_name,ja.is_primary,
        coalesce((select sum(case when x.end_time<=x.start_time then 1440 else 0 end + extract(epoch from (x.end_time-x.start_time))/60)::integer
          from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id),0) scheduled_minutes
      from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=open_shift.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=open_shift.job_id and ja.ended_at is null
      where e.workspace_id=target_workspace_id and e.archived_at is null
      and not exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
      and not exists(select 1 from public.employee_schedule_availability_versions av,lateral jsonb_array_elements(av.recurring_rules) rule
        where av.employee_id=e.id and av.version_number=(select max(v.version_number) from public.employee_schedule_availability_versions v where v.employee_id=e.id)
        and (rule->>'day')::integer=extract(dow from open_shift.scheduled_date)::integer
        and (rule->>'mode'='unavailable' or (rule->>'mode'='windows' and not exists(select 1 from jsonb_array_elements(rule->'windows') w where (w->>'start')::time<=open_shift.start_time and (w->>'end')::time>=open_shift.end_time))))
      and not exists(select 1 from jsonb_array_elements(proposals) p where (p->>'recommended_employee_id')::uuid=e.id
        and tsrange((p->>'scheduled_date')::date+(p->>'start_time')::time,(p->>'scheduled_date')::date+(p->>'end_time')::time+case when (p->>'end_time')::time<=(p->>'start_time')::time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
    ), ranked as (select *,min(scheduled_minutes) over() min_minutes from eligible)
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'scheduled_minutes',scheduled_minutes,
      'primary_job',is_primary,'reasons',to_jsonb(array_remove(array[case when scheduled_minutes=min_minutes then 'Fewest scheduled hours' end,case when is_primary then 'Primary job' end,'Available']::text[],null)))
      order by scheduled_minutes,is_primary desc,employee_id),'[]'::jsonb) into candidate_payload from ranked;
    if jsonb_array_length(candidate_payload)=0 then unfilled:=unfilled||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'reason','No eligible employee'));
    else
      recommended:=(candidate_payload->0->>'employee_id')::uuid;
      proposals:=proposals||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'location_name',open_shift.location_name,'job_name',open_shift.job_name,
        'scheduled_date',open_shift.scheduled_date,'start_time',to_char(open_shift.start_time,'HH24:MI'),'end_time',to_char(open_shift.end_time,'HH24:MI'),
        'recommended_employee_id',recommended,'candidates',candidate_payload));
    end if;
  end loop;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'session_id',target_session.id,'session_revision',target_session.revision,'proposals',proposals,'unfilled',unfilled);
  return unsigned||jsonb_build_object('status','review_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;

create function public.apply_schedule_auto_fill_service(actor_user_id uuid,target_workspace_id uuid,target_session_id uuid,expected_session_revision integer,expected_fingerprint text,assignments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_session public.schedule_edit_sessions%rowtype; preview jsonb; assignment jsonb; proposal jsonb;
  applied jsonb:='[]'::jsonb; rejected jsonb:='[]'::jsonb; shift_row public.schedule_edit_session_shifts%rowtype; employee uuid;
begin
  if jsonb_typeof(assignments)<>'array' then raise exception 'auto-fill assignments must be an array' using errcode='22023'; end if;
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id for update;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.revision<>expected_session_revision then raise exception 'stale auto-fill preview' using errcode='40001'; end if;
  preview:=public.preview_schedule_auto_fill_service(actor_user_id,target_workspace_id,target_session_id);
  if preview->>'fingerprint'<>expected_fingerprint then raise exception 'stale auto-fill preview' using errcode='40001'; end if;
  for assignment in select value from jsonb_array_elements(assignments) loop
    select value into proposal from jsonb_array_elements(preview->'proposals') where value->>'shift_id'=assignment->>'shift_id';
    employee:=(assignment->>'employee_id')::uuid;
    select * into shift_row from public.schedule_edit_session_shifts where session_id=target_session.id and id=(assignment->>'shift_id')::uuid and employee_id is null;
    if proposal is null or shift_row.id is null or not exists(select 1 from jsonb_array_elements(proposal->'candidates') c where c->>'employee_id'=assignment->>'employee_id')
      or exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=employee
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(shift_row.scheduled_date+shift_row.start_time,shift_row.scheduled_date+shift_row.end_time+case when shift_row.end_time<=shift_row.start_time then interval '1 day' else interval '0' end,'[)')) then
      rejected:=rejected||jsonb_build_array(jsonb_build_object('shift_id',assignment->>'shift_id','reason','Assignment is no longer eligible'));
    else
      update public.schedule_edit_session_shifts set employee_id=employee,revision=revision+1,updated_at=now() where session_id=target_session.id and id=shift_row.id;
      applied:=applied||jsonb_build_array(jsonb_build_object('shift_id',shift_row.id,'employee_id',employee));
    end if;
  end loop;
  if jsonb_array_length(applied)>0 then update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=target_session.id; end if;
  return jsonb_build_object('status','applied','applied',applied,'rejected',rejected,'session',public.get_schedule_edit_session_service(actor_user_id,target_workspace_id,target_session.id));
end; $$;

create function public.preview_schedule_export_service(actor_user_id uuid,target_workspace_id uuid,target_week_start date,source_type text,source_draft_id uuid,target_location_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized uuid[]; source_revision integer; rows jsonb; locations jsonb; unsigned jsonb; workspace_name text;
begin
  if source_type not in ('published','draft') then raise exception 'invalid schedule export source' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into normalized from unnest(target_location_ids) id;
  if coalesce(cardinality(normalized),0)=0 then raise exception 'schedule export location required' using errcode='22023'; end if;
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export')
    or exists(select 1 from unnest(normalized) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export',id)) then
    raise exception 'schedule export scope denied' using errcode='42501'; end if;
  if source_type='draft' then
    select revision into source_revision from public.schedule_drafts d where d.id=source_draft_id and d.workspace_id=target_workspace_id and d.week_start=target_week_start and d.archived_at is null;
    if source_revision is null then raise exception 'schedule export draft not found' using errcode='P0002'; end if;
  elsif source_draft_id is not null then raise exception 'published export cannot specify draft' using errcode='22023'; end if;
  select name into workspace_name from public.workspaces where id=target_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.sort_order,l.id),'[]'::jsonb) into locations
  from public.locations l where l.workspace_id=target_workspace_id and l.id=any(normalized);
  if jsonb_array_length(locations)<>cardinality(normalized) then raise exception 'schedule export location not found' using errcode='P0002'; end if;
  if source_type='draft' then
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.draft_id=source_draft_id and s.location_id=any(normalized);
  else
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' and p.week_start=target_week_start
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.workspace_id=target_workspace_id and s.location_id=any(normalized);
  end if;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'workspace_name',workspace_name,'week_start',target_week_start,
    'source',case when source_type='draft' then jsonb_build_object('type','draft','draft_id',source_draft_id) else jsonb_build_object('type','published') end,
    'source_revision',source_revision,'locations',locations,'rows',rows,'summary',jsonb_build_object('shift_count',jsonb_array_length(rows),
      'employee_count',(select count(distinct x->>'employee_name') from jsonb_array_elements(rows) x where x->>'employee_name' is not null),
      'scheduled_minutes',(select coalesce(sum((x->>'scheduled_minutes')::integer),0) from jsonb_array_elements(rows) x)));
  return unsigned||jsonb_build_object('status','export_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;

create function public.list_schedule_export_presets_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('presets',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'name',p.name,'settings',p.settings,'created_by',p.created_by,'updated_at',p.updated_at) order by p.updated_at desc,p.id),'[]'::jsonb))
 from public.schedule_export_presets p where p.workspace_id=target_workspace_id and p.created_by=actor_user_id
 and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export');
$$;
create function public.create_schedule_export_preset_service(actor_user_id uuid,target_workspace_id uuid,target_name text,target_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.schedule_export_presets%rowtype;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export') then raise exception 'schedule export access denied' using errcode='42501'; end if;
 insert into public.schedule_export_presets(workspace_id,name,settings,created_by,updated_by) values(target_workspace_id,btrim(target_name),target_settings,actor_user_id,actor_user_id) returning * into p;
 return jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'name',p.name,'settings',p.settings,'created_by',p.created_by,'updated_at',p.updated_at);
exception when unique_violation then raise exception 'schedule export preset name conflict' using errcode='23505'; end; $$;
create function public.delete_schedule_export_preset_service(actor_user_id uuid,target_workspace_id uuid,target_preset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 delete from public.schedule_export_presets where id=target_preset_id and workspace_id=target_workspace_id and created_by=actor_user_id;
 if not found then raise exception 'schedule export preset not found' using errcode='P0002'; end if;
 return jsonb_build_object('status','deleted','preset_id',target_preset_id);
end; $$;

revoke all on function public.schedule_actor_has_capability_service(uuid,uuid,text,uuid),
 public.list_schedule_templates_service(uuid,uuid),public.get_schedule_template_service(uuid,uuid,uuid),
 public.create_schedule_template_service(uuid,uuid,uuid,text,boolean),public.rename_schedule_template_service(uuid,uuid,uuid,text,integer),
 public.delete_schedule_template_service(uuid,uuid,uuid,integer),public.apply_schedule_template_service(uuid,uuid,uuid,integer,uuid,text),
 public.preview_schedule_auto_fill_service(uuid,uuid,uuid),public.apply_schedule_auto_fill_service(uuid,uuid,uuid,integer,text,jsonb),
 public.preview_schedule_export_service(uuid,uuid,date,text,uuid,uuid[]),public.list_schedule_export_presets_service(uuid,uuid),
 public.create_schedule_export_preset_service(uuid,uuid,text,jsonb),public.delete_schedule_export_preset_service(uuid,uuid,uuid)
from public,anon,authenticated;
grant execute on function public.schedule_actor_has_capability_service(uuid,uuid,text,uuid),
 public.list_schedule_templates_service(uuid,uuid),public.get_schedule_template_service(uuid,uuid,uuid),
 public.create_schedule_template_service(uuid,uuid,uuid,text,boolean),public.rename_schedule_template_service(uuid,uuid,uuid,text,integer),
 public.delete_schedule_template_service(uuid,uuid,uuid,integer),public.apply_schedule_template_service(uuid,uuid,uuid,integer,uuid,text),
 public.preview_schedule_auto_fill_service(uuid,uuid,uuid),public.apply_schedule_auto_fill_service(uuid,uuid,uuid,integer,text,jsonb),
 public.preview_schedule_export_service(uuid,uuid,date,text,uuid,uuid[]),public.list_schedule_export_presets_service(uuid,uuid),
 public.create_schedule_export_preset_service(uuid,uuid,text,jsonb),public.delete_schedule_export_preset_service(uuid,uuid,uuid)
to service_role;
