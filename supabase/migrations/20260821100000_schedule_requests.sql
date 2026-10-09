insert into public.permissions (key,label,category,description,custom_grantable,sort_order)
values
 ('schedule.time_off_requests.read','View time off requests','Schedule','View manager time off review queues and history.',true,51),
 ('schedule.time_off_requests.manage','Manage time off requests','Schedule','Approve, deny, return, and revoke time off requests.',true,52),
 ('schedule.shift_change_requests.read','View shift change requests','Schedule','View manager shift change queues and history.',true,53),
 ('schedule.shift_change_requests.manage','Manage shift change requests','Schedule','Approve and reject shift ownership changes.',true,54)
on conflict(key) do update set label=excluded.label,category=excluded.category,
 description=excluded.description,custom_grantable=excluded.custom_grantable,sort_order=excluded.sort_order;

insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select r.workspace_id,r.id,p.key from public.workspace_roles r
cross join(values('schedule.time_off_requests.read'),('schedule.time_off_requests.manage'),
 ('schedule.shift_change_requests.read'),('schedule.shift_change_requests.manage')) p(key)
where r.system_key in('owner','admin','manager') on conflict do nothing;

create or replace function public.initialize_workspace_roles(target_workspace_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner_role_id uuid; admin_role_id uuid; manager_role_id uuid; employee_role_id uuid;
begin
 insert into public.workspace_roles(workspace_id,name,description,system_key,access_class,sort_order) values
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
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) values
  (target_workspace_id,manager_role_id,'workspace.read'),(target_workspace_id,manager_role_id,'schedule.read'),
  (target_workspace_id,manager_role_id,'schedule.manage'),(target_workspace_id,manager_role_id,'schedule.publish'),
  (target_workspace_id,manager_role_id,'schedule.templates.manage'),(target_workspace_id,manager_role_id,'schedule.export'),
  (target_workspace_id,manager_role_id,'schedule.lineup.read'),(target_workspace_id,manager_role_id,'schedule.lineup.manage'),
  (target_workspace_id,manager_role_id,'schedule.lineup.share'),(target_workspace_id,manager_role_id,'schedule.time_off_requests.read'),
  (target_workspace_id,manager_role_id,'schedule.time_off_requests.manage'),(target_workspace_id,manager_role_id,'schedule.shift_change_requests.read'),
  (target_workspace_id,manager_role_id,'schedule.shift_change_requests.manage'),(target_workspace_id,manager_role_id,'employees.read'),
  (target_workspace_id,manager_role_id,'employees.manage'),(target_workspace_id,manager_role_id,'employee_onboarding.review'),
  (target_workspace_id,employee_role_id,'workspace.read'),(target_workspace_id,employee_role_id,'schedule.read')
 on conflict do nothing;
end; $$;

create or replace function public.enforce_role_permission_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
declare checked_role_id uuid:=coalesce(new.role_id,old.role_id);
begin
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then raise exception 'schedule.manage requires schedule.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.publish','schedule.templates.manage')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage') then raise exception 'schedule publication and templates require schedule.manage' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.export','schedule.lineup.read','schedule.time_off_requests.read','schedule.shift_change_requests.read')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then raise exception 'schedule child access requires schedule.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.lineup.manage','schedule.lineup.share')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.lineup.read') then raise exception 'line-up management and sharing require line-up read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.time_off_requests.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.time_off_requests.read') then raise exception 'time off request management requires read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.shift_change_requests.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.shift_change_requests.read') then raise exception 'shift change request management requires read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read') then raise exception 'documents.manage requires documents.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.read') then raise exception 'signature_templates.manage requires signature_templates.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('employees.manage','employees.archive')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then raise exception 'employee management requires employees.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_access.manage') and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='roles.read')) then raise exception 'employee_access.manage requires employees.read and roles.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then raise exception 'employee onboarding review requires employees.read' using errcode='23514'; end if;
 if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_documents.review') and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review') or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read')) then raise exception 'employee document review requires onboarding review and documents.read' using errcode='23514'; end if;
 return null;
end; $$;

create type public.time_off_request_status as enum('pending','approved','denied','partially_approved','revoked');
create type public.time_off_segment_status as enum('pending','approved','denied');
create type public.shift_change_request_type as enum('release_pickup','direct_coverage','direct_swap');
create type public.shift_change_request_status as enum('pending_manager_approval','approved','rejected','cancelled','expired');
create type public.shift_change_participant_role as enum('requester','giver','receiver');

create table public.schedule_time_off_requests(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 employee_id uuid not null,location_id uuid not null,request_type text not null default 'time_off' check(request_type in('time_off','time_off_cancellation')),
 reason text not null default '' check(char_length(reason)<=1000),status public.time_off_request_status not null default 'pending',
 revision integer not null default 1 check(revision>0),viewed_at timestamptz,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,workspace_id),foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete restrict,
 foreign key(location_id,workspace_id) references public.locations(id,workspace_id) on delete restrict);
create table public.schedule_time_off_segments(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,request_id uuid not null,segment_date date not null,
 start_time time,end_time time,status public.time_off_segment_status not null default 'pending',created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.schedule_time_off_requests(id,workspace_id) on delete cascade,
 check((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time<>end_time)),
 unique(request_id,segment_date,start_time,end_time));
create table public.schedule_time_off_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,request_id uuid not null,
 action text not null check(action in('submitted','viewed','approved','denied','partially_approved','returned_to_pending','revoked')),
 actor_user_id uuid not null references auth.users(id),note text not null default '' check(char_length(note)<=1000),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.schedule_time_off_requests(id,workspace_id) on delete cascade);

create table public.schedule_shift_change_requests(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 request_type public.shift_change_request_type not null,status public.shift_change_request_status not null default 'pending_manager_approval',
 offered_shift_id uuid not null references public.schedule_published_shifts(id) on delete restrict,
 requested_shift_id uuid references public.schedule_published_shifts(id) on delete restrict,
 expected_offered_employee_id uuid,expected_requested_employee_id uuid,note text not null default '' check(char_length(note)<=1000),
 revision integer not null default 1 check(revision>0),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,workspace_id),
 check((request_type='direct_swap' and requested_shift_id is not null) or (request_type<>'direct_swap' and requested_shift_id is null)));
create table public.schedule_shift_change_participants(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,request_id uuid not null,employee_id uuid not null,
 participant_role public.shift_change_participant_role not null,created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.schedule_shift_change_requests(id,workspace_id) on delete cascade,
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete restrict,
 unique(request_id,participant_role));
create table public.schedule_shift_change_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,request_id uuid not null,
 action text not null check(action in('submitted','viewed','approved','rejected','cancelled','expired')),
 actor_user_id uuid not null references auth.users(id),note text not null default '' check(char_length(note)<=1000),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.schedule_shift_change_requests(id,workspace_id) on delete cascade);

create index schedule_time_off_queue_idx on public.schedule_time_off_requests(workspace_id,status,created_at desc);
create index schedule_time_off_segments_date_idx on public.schedule_time_off_segments(workspace_id,segment_date,request_id);
create index schedule_shift_change_queue_idx on public.schedule_shift_change_requests(workspace_id,status,created_at desc);
alter table public.schedule_time_off_requests enable row level security; alter table public.schedule_time_off_segments enable row level security;
alter table public.schedule_time_off_events enable row level security; alter table public.schedule_shift_change_requests enable row level security;
alter table public.schedule_shift_change_participants enable row level security; alter table public.schedule_shift_change_events enable row level security;
revoke all on public.schedule_time_off_requests,public.schedule_time_off_segments,public.schedule_time_off_events,
 public.schedule_shift_change_requests,public.schedule_shift_change_participants,public.schedule_shift_change_events from public,anon,authenticated;
grant select on public.schedule_time_off_requests,public.schedule_time_off_segments,public.schedule_time_off_events,
 public.schedule_shift_change_requests,public.schedule_shift_change_participants,public.schedule_shift_change_events to service_role;

create function public.schedule_request_shift_payload_service(target_shift_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'location_id',s.location_id,'location_name',l.name,'scheduled_date',s.scheduled_date,
  'start_time',s.start_time,'end_time',s.end_time,'employee_id',s.employee_id,
  'employee_name',case when e.id is null then null else concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) end,
  'job_name',j.name)
 from public.schedule_published_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
 left join public.employee_profiles e on e.id=s.employee_id where s.id=target_shift_id;
$$;

create function public.get_shift_change_conflicts_service(target_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.schedule_shift_change_requests%rowtype; offered public.schedule_published_shifts%rowtype;
 requested public.schedule_published_shifts%rowtype; receiver_id uuid; result jsonb:='[]'::jsonb;
begin
 select * into r from public.schedule_shift_change_requests where id=target_request_id;
 select * into offered from public.schedule_published_shifts where id=r.offered_shift_id;
 if r.requested_shift_id is not null then select * into requested from public.schedule_published_shifts where id=r.requested_shift_id; end if;
 select employee_id into receiver_id from public.schedule_shift_change_participants where request_id=r.id and participant_role='receiver';
 if offered.id is null or not exists(select 1 from public.schedule_location_publications p where p.id=offered.publication_id and p.status='current') then result:=result||jsonb_build_array(jsonb_build_object('code','offered_shift_unavailable','severity','hard','message','The offered shift is no longer published.'));
 elsif offered.employee_id is distinct from r.expected_offered_employee_id then result:=result||jsonb_build_array(jsonb_build_object('code','offered_owner_changed','severity','hard','message','The offered shift owner changed.')); end if;
 if r.request_type='direct_swap' and (requested.id is null or requested.employee_id is distinct from r.expected_requested_employee_id) then result:=result||jsonb_build_array(jsonb_build_object('code','requested_owner_changed','severity','hard','message','The requested shift owner changed.')); end if;
 if receiver_id is null then result:=result||jsonb_build_array(jsonb_build_object('code','receiver_missing','severity','hard','message','A receiving employee is required.')); end if;
 if receiver_id is not null and exists(select 1 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' where s.workspace_id=r.workspace_id and s.employee_id=receiver_id and s.scheduled_date=offered.scheduled_date and s.id not in(r.offered_shift_id,coalesce(r.requested_shift_id,r.offered_shift_id)) and s.start_time<offered.end_time and s.end_time>offered.start_time) then result:=result||jsonb_build_array(jsonb_build_object('code','schedule_overlap','severity','hard','message','The receiving employee has an overlapping published shift.')); end if;
 if receiver_id is not null and exists(select 1 from public.schedule_time_off_requests tr join public.schedule_time_off_segments sg on sg.request_id=tr.id where tr.workspace_id=r.workspace_id and tr.employee_id=receiver_id and tr.status in('approved','partially_approved') and sg.status='approved' and sg.segment_date=offered.scheduled_date) then result:=result||jsonb_build_array(jsonb_build_object('code','approved_time_off','severity','hard','message','The receiving employee has approved time off.')); end if;
 if receiver_id is not null and not exists(select 1 from public.employee_location_assignments a where a.workspace_id=r.workspace_id and a.employee_id=receiver_id and a.location_id=offered.location_id and a.ended_at is null) then result:=result||jsonb_build_array(jsonb_build_object('code','location_assignment','severity','soft','message','The receiving employee is not assigned to this location.')); end if;
 return result;
end; $$;

create function public.get_schedule_requests_service(actor_user_id uuid,target_workspace_id uuid,
 target_time_off_queue text default 'needs_review',target_shift_queue text default 'needs_review',target_location_id uuid default null,
 target_search text default '',target_time_off_cursor timestamptz default null,target_shift_cursor timestamptz default null,target_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_time_off boolean; can_shift boolean; time_rows jsonb; shift_rows jsonb; locations jsonb;
 time_count integer; shift_count integer; time_cursor timestamptz; shift_cursor timestamptz;
begin
 if target_time_off_queue not in('needs_review','closed') or target_shift_queue not in('needs_review','history') or target_limit not between 1 and 100 then raise exception 'invalid schedule request query' using errcode='22023'; end if;
 can_time_off:=public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read');
 can_shift:=public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read');
 if not can_time_off and not can_shift then raise exception 'schedule request read access denied' using errcode='42501'; end if;
 if target_location_id is not null and ((can_time_off and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',target_location_id)) or (can_shift and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',target_location_id))) then raise exception 'schedule request scope denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name),'[]') into locations from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null and ((can_time_off and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',l.id)) or (can_shift and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',l.id)));
 select count(*) into time_count from public.schedule_time_off_requests r where can_time_off and r.workspace_id=target_workspace_id and r.status='pending' and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id);
 with filtered as(select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id where can_time_off and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1), page as(select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'location_id',r.location_id,'location_name',l.name,'request_type',r.request_type,'reason',r.reason,'status',r.status,'start_date',(select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'end_date',(select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'revision',r.revision,'viewed_at',r.viewed_at,'created_at',r.created_at,'conflict_count',(select count(*) from public.schedule_published_shifts ps join public.schedule_location_publications p on p.id=ps.publication_id and p.status='current' where ps.employee_id=r.employee_id and ps.location_id=r.location_id and ps.scheduled_date in(select segment_date from public.schedule_time_off_segments where request_id=r.id)),'segments',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'segment_date',s.segment_date,'start_time',s.start_time,'end_time',s.end_time,'status',s.status) order by s.segment_date,s.start_time) from public.schedule_time_off_segments s where s.request_id=r.id),'[]'),'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'actor_name',coalesce(nullif(up.display_name,''),'Team member'),'note',ev.note,'created_at',ev.created_at) order by ev.created_at) from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id=ev.actor_user_id where ev.request_id=r.id),'[]')) order by r.created_at desc),'[]') into time_rows from page r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id;
 with filtered as(select r.created_at from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id where can_time_off and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1) select case when count(*)>target_limit then min(created_at) else null end into time_cursor from filtered;
 select count(*) into shift_count from public.schedule_shift_change_requests r join public.schedule_published_shifts s on s.id=r.offered_shift_id where can_shift and r.workspace_id=target_workspace_id and r.status='pending_manager_approval' and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',s.location_id);
 with filtered as(select r.* from public.schedule_shift_change_requests r join public.schedule_published_shifts s on s.id=r.offered_shift_id where can_shift and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',s.location_id) and (target_location_id is null or s.location_id=target_location_id) and ((target_shift_queue='needs_review' and r.status='pending_manager_approval') or (target_shift_queue='history' and r.status<>'pending_manager_approval')) and (target_shift_cursor is null or r.created_at<target_shift_cursor) and (btrim(target_search)='' or r.note ilike '%'||btrim(target_search)||'%' or exists(select 1 from public.schedule_shift_change_participants sp join public.employee_profiles e on e.id=sp.employee_id where sp.request_id=r.id and concat_ws(' ',e.first_name,e.last_name,e.preferred_name) ilike '%'||btrim(target_search)||'%')) order by r.created_at desc,r.id limit target_limit+1),page as(select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'request_type',r.request_type,'status',r.status,'revision',r.revision,'note',r.note,'created_at',r.created_at,'offered_shift',public.schedule_request_shift_payload_service(r.offered_shift_id),'requested_shift',case when r.requested_shift_id is null then null else public.schedule_request_shift_payload_service(r.requested_shift_id) end,'participants',coalesce((select jsonb_agg(jsonb_build_object('employee_id',sp.employee_id,'employee_name',concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'role',sp.participant_role) order by sp.participant_role) from public.schedule_shift_change_participants sp join public.employee_profiles e on e.id=sp.employee_id where sp.request_id=r.id),'[]'),'conflicts',public.get_shift_change_conflicts_service(r.id),'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'actor_name',coalesce(nullif(up.display_name,''),'Team member'),'note',ev.note,'created_at',ev.created_at) order by ev.created_at) from public.schedule_shift_change_events ev left join public.user_profiles up on up.user_id=ev.actor_user_id where ev.request_id=r.id),'[]')) order by r.created_at desc),'[]') into shift_rows from page r;
 with filtered as(select r.created_at from public.schedule_shift_change_requests r join public.schedule_published_shifts s on s.id=r.offered_shift_id where can_shift and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',s.location_id) and (target_location_id is null or s.location_id=target_location_id) and ((target_shift_queue='needs_review' and r.status='pending_manager_approval') or (target_shift_queue='history' and r.status<>'pending_manager_approval')) and (target_shift_cursor is null or r.created_at<target_shift_cursor) order by r.created_at desc,r.id limit target_limit+1) select case when count(*)>target_limit then min(created_at) else null end into shift_cursor from filtered;
 return jsonb_build_object('workspace_id',target_workspace_id,'locations',locations,'time_off_pending_count',time_count,'shift_change_pending_count',shift_count,'time_off_next_cursor',time_cursor,'shift_change_next_cursor',shift_cursor,'time_off_requests',time_rows,'shift_change_requests',shift_rows);
end; $$;

create function public.mark_schedule_time_off_viewed_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype;
begin
 select * into r from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id) then raise exception 'time off request read access denied' using errcode='42501'; end if;
 if r.viewed_at is null then update public.schedule_time_off_requests set viewed_at=now(),updated_at=now() where id=r.id; insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id) values(target_workspace_id,r.id,'viewed',actor_user_id); end if;
 return jsonb_build_object('status','viewed','request_id',r.id,'revision',r.revision);
end; $$;

create function public.resolve_schedule_time_off_request_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid,
 target_expected_revision integer,target_action text,target_note text default '',target_segment_decisions jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; next_status public.time_off_request_status; pending_count integer; decision_count integer;
begin
 select * into r from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if r.revision<>target_expected_revision then raise exception 'stale time off request' using errcode='40001'; end if;
 if target_action in('approve','deny','partial_approve') and r.status<>'pending' then raise exception 'time off request is not pending' using errcode='40001'; end if;
 if target_action in('return_to_pending','revoke') and r.status='pending' then raise exception 'time off request transition is invalid' using errcode='40001'; end if;
 if target_action='approve' then update public.schedule_time_off_segments set status='approved' where request_id=r.id; next_status:='approved';
 elsif target_action='deny' then update public.schedule_time_off_segments set status='denied' where request_id=r.id; next_status:='denied';
 elsif target_action='partial_approve' then
  select count(*) into pending_count from public.schedule_time_off_segments where request_id=r.id and status='pending';
  select count(*) into decision_count from jsonb_array_elements(target_segment_decisions) d join public.schedule_time_off_segments s on s.id=(d->>'segment_id')::uuid and s.request_id=r.id where d->>'status' in('approved','denied');
  if pending_count=0 or decision_count<>pending_count or jsonb_array_length(target_segment_decisions)<>pending_count then raise exception 'every pending segment requires one decision' using errcode='22023'; end if;
  update public.schedule_time_off_segments s set status=(d.value->>'status')::public.time_off_segment_status from jsonb_array_elements(target_segment_decisions) d(value) where s.id=(d.value->>'segment_id')::uuid and s.request_id=r.id;
  if exists(select 1 from public.schedule_time_off_segments where request_id=r.id and status='approved') and exists(select 1 from public.schedule_time_off_segments where request_id=r.id and status='denied') then next_status:='partially_approved'; elsif exists(select 1 from public.schedule_time_off_segments where request_id=r.id and status='approved') then next_status:='approved'; else next_status:='denied'; end if;
 elsif target_action='return_to_pending' then update public.schedule_time_off_segments set status='pending' where request_id=r.id; next_status:='pending';
 elsif target_action='revoke' then next_status:='revoked';
 else raise exception 'unsupported time off request action' using errcode='22023'; end if;
 update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata) values(target_workspace_id,r.id,case target_action when 'approve' then 'approved' when 'deny' then 'denied' when 'partial_approve' then 'partially_approved' when 'return_to_pending' then 'returned_to_pending' else 'revoked' end,actor_user_id,btrim(coalesce(target_note,'')),jsonb_build_object('revision',r.revision,'segments',target_segment_decisions));
 return jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision);
end; $$;

create function public.resolve_schedule_shift_change_request_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid,
 target_expected_revision integer,target_action text,target_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_shift_change_requests%rowtype; offered public.schedule_published_shifts%rowtype;
 requested public.schedule_published_shifts%rowtype; receiver_id uuid; conflicts jsonb; hard_count integer; soft_count integer;
begin
 select * into r from public.schedule_shift_change_requests where id=target_request_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'shift change request not found' using errcode='P0002'; end if;
 select * into offered from public.schedule_published_shifts where id=r.offered_shift_id for update;
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.manage',offered.location_id) then raise exception 'shift change request manage access denied' using errcode='42501'; end if;
 if r.requested_shift_id is not null then select * into requested from public.schedule_published_shifts where id=r.requested_shift_id for update; if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.manage',requested.location_id) then raise exception 'shift change request scope denied' using errcode='42501'; end if; end if;
 if r.revision<>target_expected_revision or r.status<>'pending_manager_approval' then raise exception 'stale shift change request' using errcode='40001'; end if;
 if target_action not in('approve','reject') then raise exception 'unsupported shift change action' using errcode='22023'; end if;
 conflicts:=public.get_shift_change_conflicts_service(r.id);
 select count(*) filter(where c->>'severity'='hard'),count(*) filter(where c->>'severity'='soft') into hard_count,soft_count from jsonb_array_elements(conflicts)c;
 if target_action='approve' and hard_count>0 then raise exception 'hard shift conflict blocks approval' using errcode='23514'; end if;
 if target_action='approve' and soft_count>0 and char_length(btrim(coalesce(target_note,'')))<10 then raise exception 'soft conflict override note required' using errcode='23514'; end if;
 if target_action='approve' then
  select employee_id into receiver_id from public.schedule_shift_change_participants where request_id=r.id and participant_role='receiver';
  if r.request_type='direct_swap' then update public.schedule_published_shifts set employee_id=requested.employee_id where id=offered.id; update public.schedule_published_shifts set employee_id=offered.employee_id where id=requested.id;
  else update public.schedule_published_shifts set employee_id=receiver_id where id=offered.id; end if;
  update public.schedule_shift_change_requests set status='approved',revision=revision+1,updated_at=now() where id=r.id returning * into r;
 else update public.schedule_shift_change_requests set status='rejected',revision=revision+1,updated_at=now() where id=r.id returning * into r; end if;
 insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id,note,metadata) values(target_workspace_id,r.id,case when target_action='approve' then 'approved' else 'rejected' end,actor_user_id,btrim(coalesce(target_note,'')),jsonb_build_object('revision',r.revision,'conflicts',conflicts));
 return jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision);
end; $$;

revoke all on function public.schedule_request_shift_payload_service(uuid),public.get_shift_change_conflicts_service(uuid),
 public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer),
 public.mark_schedule_time_off_viewed_service(uuid,uuid,uuid),
 public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb),
 public.resolve_schedule_shift_change_request_service(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.schedule_request_shift_payload_service(uuid),public.get_shift_change_conflicts_service(uuid),
 public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer),
 public.mark_schedule_time_off_viewed_service(uuid,uuid,uuid),
 public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb),
 public.resolve_schedule_shift_change_request_service(uuid,uuid,uuid,integer,text,text) to service_role;
