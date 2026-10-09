insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('schedule.lineup.read', 'View line-up', 'Schedule', 'View daily operational line-ups.', true, 48),
  ('schedule.lineup.manage', 'Manage line-up', 'Schedule', 'Arrange staff and service briefs.', true, 49),
  ('schedule.lineup.share', 'Share line-up', 'Schedule', 'Create immutable line-up share versions.', true, 50)
on conflict (key) do update set label=excluded.label, category=excluded.category,
  description=excluded.description, custom_grantable=excluded.custom_grantable,
  sort_order=excluded.sort_order;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (values ('schedule.lineup.read'), ('schedule.lineup.manage'), ('schedule.lineup.share')) permission(key)
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
    (target_workspace_id,manager_role_id,'schedule.lineup.read'),
    (target_workspace_id,manager_role_id,'schedule.lineup.manage'),
    (target_workspace_id,manager_role_id,'schedule.lineup.share'),
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
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in ('schedule.export','schedule.lineup.read'))
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then
    raise exception 'schedule export and line-up require schedule.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in ('schedule.lineup.manage','schedule.lineup.share'))
    and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.lineup.read') then
    raise exception 'line-up management and sharing require line-up read' using errcode='23514'; end if;
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

create table public.schedule_lineup_sections (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 80), color text not null check(color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check(sort_order>=0), revision integer not null default 1 check(revision>0),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,workspace_id)
);
create unique index schedule_lineup_sections_name_idx on public.schedule_lineup_sections(workspace_id,lower(btrim(name))) where archived_at is null;

create table public.schedule_lineups (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null, lineup_date date not null, revision integer not null default 1 check(revision>0),
  share_version integer not null default 0 check(share_version>=0), shared_at timestamptz,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(location_id,workspace_id) references public.locations(id,workspace_id) on delete cascade,
  unique(workspace_id,location_id,lineup_date), unique(id,workspace_id,location_id)
);

create table public.schedule_lineup_entries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, lineup_id uuid not null, location_id uuid not null,
  source_shift_id uuid,
  employee_id uuid, job_id uuid, shift_type_id uuid, start_time time, end_time time, section_id uuid,
  station text not null default '' check(char_length(station)<=80), call_off boolean not null default false,
  hidden boolean not null default false, display_order integer not null default 0 check(display_order>=0),
  revision integer not null default 1 check(revision>0), created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(lineup_id,workspace_id,location_id) references public.schedule_lineups(id,workspace_id,location_id) on delete cascade,
  foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete restrict,
  foreign key(job_id,workspace_id) references public.jobs(id,workspace_id) on delete restrict,
  foreign key(shift_type_id,workspace_id) references public.shift_types(id,workspace_id) on delete restrict,
  foreign key(section_id,workspace_id) references public.schedule_lineup_sections(id,workspace_id) on delete restrict,
  check((start_time is null)=(end_time is null)), check(start_time is null or start_time<>end_time)
);
create unique index schedule_lineup_entries_source_idx on public.schedule_lineup_entries(lineup_id,source_shift_id) where source_shift_id is not null;

create table public.schedule_lineup_briefs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, lineup_id uuid not null, location_id uuid not null,
  shift_type_id uuid not null, out_of_stock text not null default '' check(char_length(out_of_stock)<=1000),
  specials text not null default '' check(char_length(specials)<=1000), pre_shift_notes text not null default '' check(char_length(pre_shift_notes)<=2000),
  revision integer not null default 1 check(revision>0), updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  foreign key(lineup_id,workspace_id,location_id) references public.schedule_lineups(id,workspace_id,location_id) on delete cascade,
  foreign key(shift_type_id,workspace_id) references public.shift_types(id,workspace_id) on delete restrict,
  unique(lineup_id,shift_type_id)
);

create table public.schedule_lineup_snapshots (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null, lineup_date date not null, version_number integer not null check(version_number>0),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'), content jsonb not null check(jsonb_typeof(content)='object'),
  shared_by uuid not null references auth.users(id), shared_at timestamptz not null default now(),
  foreign key(location_id,workspace_id) references public.locations(id,workspace_id) on delete restrict,
  unique(workspace_id,location_id,lineup_date,version_number)
);

alter table public.schedule_lineup_sections enable row level security;
alter table public.schedule_lineups enable row level security;
alter table public.schedule_lineup_entries enable row level security;
alter table public.schedule_lineup_briefs enable row level security;
alter table public.schedule_lineup_snapshots enable row level security;
revoke all on public.schedule_lineup_sections,public.schedule_lineups,public.schedule_lineup_entries,public.schedule_lineup_briefs,public.schedule_lineup_snapshots from public,anon,authenticated;
grant select on public.schedule_lineup_sections,public.schedule_lineups,public.schedule_lineup_entries,public.schedule_lineup_briefs,public.schedule_lineup_snapshots to service_role;

insert into public.schedule_lineup_sections(workspace_id,name,color,sort_order)
select workspace.id, defaults.name, defaults.color, defaults.sort_order from public.workspaces workspace
cross join (values ('Floor','#397A68',0),('Bar','#596FA8',10),('Kitchen','#A15F4D',20)) defaults(name,color,sort_order)
on conflict do nothing;

create function public.initialize_schedule_lineup_sections_after_workspace_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.schedule_lineup_sections(workspace_id,name,color,sort_order)
  values(new.id,'Floor','#397A68',0),(new.id,'Bar','#596FA8',10),(new.id,'Kitchen','#A15F4D',20);
  return new;
end; $$;
create trigger initialize_schedule_lineup_sections_trigger after insert on public.workspaces
for each row execute function public.initialize_schedule_lineup_sections_after_workspace_insert();

create function public.get_schedule_lineup_service(actor_user_id uuid,target_workspace_id uuid,target_date date,
  target_location_ids uuid[] default null,target_shift_type_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.read') then
    raise exception 'schedule line-up read access denied' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(target_location_ids,'{}')) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.read',id)) then
    raise exception 'schedule line-up scope denied' using errcode='42501'; end if;

  with allowed_locations as (
    select l.* from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null
      and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.read',l.id)
      and (target_location_ids is null or l.id=any(target_location_ids))
  ), source_rows as (
    select s.id source_shift_id,s.location_id,s.employee_id,s.job_id,s.shift_type_id,s.start_time,s.end_time,
      row_number() over(partition by s.location_id order by s.start_time,s.id)::integer-1 default_order
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join allowed_locations l on l.id=s.location_id where s.workspace_id=target_workspace_id and s.scheduled_date=target_date
      and (target_shift_type_ids is null or s.shift_type_id=any(target_shift_type_ids))
  ), rows as (
    select coalesce(e.id,s.source_shift_id) id,e.id overlay_id,s.source_shift_id,false is_manual,false orphaned,
      coalesce(e.employee_id,s.employee_id) employee_id,coalesce(e.job_id,s.job_id) job_id,
      coalesce(e.shift_type_id,s.shift_type_id) shift_type_id,coalesce(e.start_time,s.start_time) start_time,
      coalesce(e.end_time,s.end_time) end_time,e.section_id,coalesce(e.station,'') station,
      coalesce(e.call_off,false) call_off,coalesce(e.hidden,false) hidden,coalesce(e.display_order,s.default_order) display_order,e.revision,s.location_id
    from source_rows s left join public.schedule_lineups ln on ln.workspace_id=target_workspace_id and ln.location_id=s.location_id and ln.lineup_date=target_date
    left join public.schedule_lineup_entries e on e.lineup_id=ln.id and e.source_shift_id=s.source_shift_id
    union all
    select e.id,e.id,null,true,false,e.employee_id,e.job_id,e.shift_type_id,e.start_time,e.end_time,e.section_id,e.station,e.call_off,e.hidden,e.display_order,e.revision,e.location_id
    from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id join allowed_locations l on l.id=e.location_id
    where ln.lineup_date=target_date and e.source_shift_id is null and (target_shift_type_ids is null or e.shift_type_id=any(target_shift_type_ids))
    union all
    select e.id,e.id,e.source_shift_id,false,true,e.employee_id,e.job_id,e.shift_type_id,e.start_time,e.end_time,e.section_id,e.station,e.call_off,e.hidden,e.display_order,e.revision,e.location_id
    from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id join allowed_locations l on l.id=e.location_id
    where ln.lineup_date=target_date and e.source_shift_id is not null
      and (target_shift_type_ids is null or e.shift_type_id=any(target_shift_type_ids))
      and not exists(select 1 from public.schedule_published_shifts source join public.schedule_location_publications publication on publication.id=source.publication_id and publication.status='current' where source.id=e.source_shift_id and source.scheduled_date=target_date)
  )
  select jsonb_build_object('workspace_id',target_workspace_id,'date',target_date,'source','published',
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'timezone',l.timezone,
      'lineup_id',ln.id,'revision',ln.revision,'shared_at',ln.shared_at,'share_version',coalesce(ln.share_version,0),
      'entries',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'overlay_id',r.overlay_id,'source_shift_id',r.source_shift_id,'is_manual',r.is_manual,'orphaned',r.orphaned,
        'employee_id',r.employee_id,'employee_name',coalesce(nullif(ep.preferred_name,''),concat_ws(' ',ep.first_name,ep.last_name),''),
        'job_id',r.job_id,'job_name',coalesce(j.name,''),'shift_type_id',r.shift_type_id,'shift_type_name',coalesce(st.name,''),
        'start_time',to_char(r.start_time,'HH24:MI'),'end_time',to_char(r.end_time,'HH24:MI'),'section_id',r.section_id,'section_name',coalesce(sec.name,''),
        'station',r.station,'call_off',r.call_off,'hidden',r.hidden,'display_order',r.display_order,'revision',r.revision)
        order by r.call_off,r.display_order,r.id) from rows r left join public.employee_profiles ep on ep.id=r.employee_id
        left join public.jobs j on j.id=r.job_id left join public.shift_types st on st.id=r.shift_type_id
        left join public.schedule_lineup_sections sec on sec.id=r.section_id where r.location_id=l.id),'[]'::jsonb),
      'briefs',coalesce((select jsonb_agg(jsonb_build_object('shift_type_id',b.shift_type_id,'out_of_stock',b.out_of_stock,'specials',b.specials,'pre_shift_notes',b.pre_shift_notes,'revision',b.revision)) from public.schedule_lineup_briefs b where b.lineup_id=ln.id),'[]'::jsonb),
      'summary',jsonb_build_object('active_entries',(select count(*) from rows r where r.location_id=l.id and not r.hidden),
        'open_rows',(select count(*) from rows r where r.location_id=l.id and not r.hidden and r.employee_id is null),
        'called_off',(select count(*) from rows r where r.location_id=l.id and not r.hidden and r.call_off))) order by l.sort_order,l.name) from allowed_locations l
      left join public.schedule_lineups ln on ln.workspace_id=target_workspace_id and ln.location_id=l.id and ln.lineup_date=target_date),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'workspace_id',s.workspace_id,'name',s.name,'color',s.color,'sort_order',s.sort_order,'revision',s.revision) order by s.sort_order,s.name) from public.schedule_lineup_sections s where s.workspace_id=target_workspace_id and s.archived_at is null),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'color',j.color,'sort_order',j.sort_order,'department_id',j.department_id) order by j.sort_order,j.name) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'::jsonb),
    'shift_types',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'color',s.color,'sort_order',s.sort_order,'default_start_time',to_char(s.default_start_time,'HH24:MI'),'default_end_time',to_char(s.default_end_time,'HH24:MI')) order by s.sort_order,s.name) from public.shift_types s where s.workspace_id=target_workspace_id and s.archived_at is null),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'display_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),'employee_code',e.employee_code,
      'location_ids',coalesce((select jsonb_agg(a.location_id) from public.employee_location_assignments a where a.employee_id=e.id and a.ended_at is null),'[]'::jsonb),
      'job_ids',coalesce((select jsonb_agg(a.job_id) from public.employee_job_assignments a where a.employee_id=e.id and a.ended_at is null),'[]'::jsonb),
      'presences',coalesce((select jsonb_agg(jsonb_build_object('location_id',p.location_id,'location_name',l.name,'start_time',to_char(p.start_time,'HH24:MI'),'end_time',to_char(p.end_time,'HH24:MI'))) from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current' join public.locations l on l.id=p.location_id where p.employee_id=e.id and p.scheduled_date=target_date),'[]'::jsonb)) order by e.last_name,e.first_name) from public.employee_profiles e where e.workspace_id=target_workspace_id and e.archived_at is null),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create function public.upsert_schedule_lineup_entry_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,target_date date,
  target_entry_id uuid,target_expected_revision integer,entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ln public.schedule_lineups%rowtype; saved public.schedule_lineup_entries%rowtype; source_id uuid := nullif(entry->>'source_shift_id','')::uuid;
begin
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage',target_location_id) then raise exception 'schedule line-up manage access denied' using errcode='42501'; end if;
  if source_id is not null and not exists(select 1 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' where s.id=source_id and s.workspace_id=target_workspace_id and s.location_id=target_location_id and s.scheduled_date=target_date) then raise exception 'published shift not found' using errcode='P0002'; end if;
  insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(target_workspace_id,target_location_id,target_date,actor_user_id,actor_user_id)
    on conflict(workspace_id,location_id,lineup_date) do update set updated_at=now(),updated_by=actor_user_id returning * into ln;
  if target_entry_id is null then
    insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,call_off,hidden,display_order,created_by,updated_by)
    values(target_workspace_id,ln.id,target_location_id,source_id,nullif(entry->>'employee_id','')::uuid,nullif(entry->>'job_id','')::uuid,nullif(entry->>'shift_type_id','')::uuid,nullif(entry->>'start_time','')::time,nullif(entry->>'end_time','')::time,nullif(entry->>'section_id','')::uuid,coalesce(entry->>'station',''),coalesce((entry->>'call_off')::boolean,false),coalesce((entry->>'hidden')::boolean,false),coalesce((entry->>'display_order')::integer,0),actor_user_id,actor_user_id) returning * into saved;
  else
    update public.schedule_lineup_entries set employee_id=nullif(entry->>'employee_id','')::uuid,job_id=nullif(entry->>'job_id','')::uuid,shift_type_id=nullif(entry->>'shift_type_id','')::uuid,start_time=nullif(entry->>'start_time','')::time,end_time=nullif(entry->>'end_time','')::time,section_id=nullif(entry->>'section_id','')::uuid,station=coalesce(entry->>'station',''),call_off=coalesce((entry->>'call_off')::boolean,false),hidden=coalesce((entry->>'hidden')::boolean,false),display_order=coalesce((entry->>'display_order')::integer,0),revision=revision+1,updated_by=actor_user_id,updated_at=now()
    where id=target_entry_id and lineup_id=ln.id and revision=target_expected_revision returning * into saved;
    if saved.id is null then raise exception 'stale schedule line-up entry' using errcode='40001'; end if;
  end if;
  update public.schedule_lineups set revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=ln.id returning * into ln;
  return jsonb_build_object('status','saved','lineup_id',ln.id,'lineup_revision',ln.revision,'entry_id',saved.id,'entry_revision',saved.revision);
end; $$;

create function public.upsert_schedule_lineup_section_service(actor_user_id uuid,target_workspace_id uuid,target_section_id uuid,target_expected_revision integer,section jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.schedule_lineup_sections%rowtype;
begin
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage') then raise exception 'schedule line-up manage access denied' using errcode='42501'; end if;
  if target_section_id is null then
    insert into public.schedule_lineup_sections(workspace_id,name,color,sort_order)
    values(target_workspace_id,btrim(section->>'name'),section->>'color',coalesce((section->>'sort_order')::integer,0)) returning * into saved;
  else
    update public.schedule_lineup_sections set name=btrim(section->>'name'),color=section->>'color',sort_order=coalesce((section->>'sort_order')::integer,0),revision=revision+1,updated_at=now()
    where id=target_section_id and workspace_id=target_workspace_id and archived_at is null and revision=target_expected_revision returning * into saved;
    if saved.id is null then raise exception 'stale schedule line-up section' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',saved.id,'workspace_id',saved.workspace_id,'name',saved.name,'color',saved.color,'sort_order',saved.sort_order,'revision',saved.revision);
end; $$;

create function public.archive_schedule_lineup_section_service(actor_user_id uuid,target_workspace_id uuid,target_section_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage') then raise exception 'schedule line-up manage access denied' using errcode='42501'; end if;
  perform 1 from public.schedule_lineup_sections where id=target_section_id and workspace_id=target_workspace_id and archived_at is null and revision=target_expected_revision for update;
  if not found then raise exception 'stale schedule line-up section' using errcode='40001'; end if;
  update public.schedule_lineup_entries set section_id=null,revision=revision+1,updated_by=actor_user_id,updated_at=now() where workspace_id=target_workspace_id and section_id=target_section_id;
  update public.schedule_lineup_sections set archived_at=now(),revision=revision+1,updated_at=now() where id=target_section_id returning id into saved_id;
  return jsonb_build_object('status','archived','id',saved_id);
end; $$;

create function public.delete_schedule_lineup_entry_service(actor_user_id uuid,target_workspace_id uuid,target_entry_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.schedule_lineup_entries%rowtype; ln public.schedule_lineups%rowtype;
begin
  select e.* into saved from public.schedule_lineup_entries e where e.id=target_entry_id and e.workspace_id=target_workspace_id;
  if saved.id is null then raise exception 'schedule line-up entry not found' using errcode='P0002'; end if;
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage',saved.location_id) then raise exception 'schedule line-up manage access denied' using errcode='42501'; end if;
  if saved.revision<>target_expected_revision then raise exception 'stale schedule line-up entry' using errcode='40001'; end if;
  if saved.source_shift_id is null then delete from public.schedule_lineup_entries where id=saved.id; else update public.schedule_lineup_entries set hidden=true,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=saved.id; end if;
  update public.schedule_lineups set revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=saved.lineup_id returning * into ln;
  return jsonb_build_object('status','deleted','lineup_id',ln.id,'lineup_revision',ln.revision,'entry_id',null,'entry_revision',null);
end; $$;

create function public.upsert_schedule_lineup_brief_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,target_date date,target_shift_type_id uuid,target_expected_revision integer,brief jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ln public.schedule_lineups%rowtype; saved public.schedule_lineup_briefs%rowtype;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage',target_location_id) then raise exception 'schedule line-up manage access denied' using errcode='42501'; end if;
 insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(target_workspace_id,target_location_id,target_date,actor_user_id,actor_user_id)
 on conflict(workspace_id,location_id,lineup_date) do update set updated_at=now(),updated_by=actor_user_id returning * into ln;
 insert into public.schedule_lineup_briefs(workspace_id,lineup_id,location_id,shift_type_id,out_of_stock,specials,pre_shift_notes,updated_by)
 values(target_workspace_id,ln.id,target_location_id,target_shift_type_id,coalesce(brief->>'out_of_stock',''),coalesce(brief->>'specials',''),coalesce(brief->>'pre_shift_notes',''),actor_user_id)
 on conflict(lineup_id,shift_type_id) do update set out_of_stock=excluded.out_of_stock,specials=excluded.specials,pre_shift_notes=excluded.pre_shift_notes,revision=public.schedule_lineup_briefs.revision+1,updated_by=actor_user_id,updated_at=now()
 where target_expected_revision is null or public.schedule_lineup_briefs.revision=target_expected_revision returning * into saved;
 if saved.id is null then raise exception 'stale schedule line-up brief' using errcode='40001'; end if;
 update public.schedule_lineups set revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=ln.id;
 return jsonb_build_object('status','saved','lineup_id',ln.id,'lineup_revision',ln.revision+1,'entry_id',saved.id,'entry_revision',saved.revision);
end; $$;

create function public.preview_schedule_lineup_share_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare model jsonb; fingerprint text;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share') or exists(select 1 from unnest(target_location_ids) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share',id)) then raise exception 'schedule line-up share access denied' using errcode='42501'; end if;
 model:=public.get_schedule_lineup_service(actor_user_id,target_workspace_id,target_date,target_location_ids,null);
 model:=jsonb_set(model,'{locations}',coalesce((select jsonb_agg(jsonb_set(location,'{entries}',coalesce((select jsonb_agg(entry) from jsonb_array_elements(location->'entries') entry where not coalesce((entry->>'call_off')::boolean,false) and not coalesce((entry->>'hidden')::boolean,false)),'[]'::jsonb))) from jsonb_array_elements(model->'locations') location),'[]'::jsonb));
 fingerprint:=encode(extensions.digest(convert_to(model::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('status','share_ready','workspace_id',target_workspace_id,'date',target_date,'fingerprint',fingerprint,'locations',
   coalesce((select jsonb_agg(jsonb_build_object(
     'location_id',l->>'id','location_name',l->>'name','current_version',coalesce(previous.version_number,0),
     'entry_count',jsonb_array_length(l->'entries'),
     'added',(select count(*) from jsonb_array_elements(l->'entries') current_entry where not exists(select 1 from jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) previous_entry where previous_entry->>'id'=current_entry->>'id')),
     'updated',(select count(*) from jsonb_array_elements(l->'entries') current_entry join jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) previous_entry on previous_entry->>'id'=current_entry->>'id' where previous_entry<>current_entry),
     'removed',(select count(*) from jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) previous_entry where not exists(select 1 from jsonb_array_elements(l->'entries') current_entry where current_entry->>'id'=previous_entry->>'id'))
   ) order by l->>'name') from jsonb_array_elements(model->'locations') l left join lateral (
     select snapshot.version_number,snapshot.content from public.schedule_lineup_snapshots snapshot
     where snapshot.workspace_id=target_workspace_id and snapshot.location_id=(l->>'id')::uuid and snapshot.lineup_date=target_date
     order by snapshot.version_number desc limit 1
   ) previous on true),'[]'::jsonb));
end; $$;

create function public.share_schedule_lineup_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[],expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare model jsonb; actual text; item jsonb; ln public.schedule_lineups%rowtype; snapshot_ids uuid[]:='{}'; saved_id uuid; shared_time timestamptz:=now();
begin
 model:=public.get_schedule_lineup_service(actor_user_id,target_workspace_id,target_date,target_location_ids,null);
 model:=jsonb_set(model,'{locations}',coalesce((select jsonb_agg(jsonb_set(location,'{entries}',coalesce((select jsonb_agg(entry) from jsonb_array_elements(location->'entries') entry where not coalesce((entry->>'call_off')::boolean,false) and not coalesce((entry->>'hidden')::boolean,false)),'[]'::jsonb))) from jsonb_array_elements(model->'locations') location),'[]'::jsonb));
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share') or exists(select 1 from unnest(target_location_ids) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share',id)) then raise exception 'schedule line-up share access denied' using errcode='42501'; end if;
 actual:=encode(extensions.digest(convert_to(model::text,'UTF8'),'sha256'),'hex'); if actual<>expected_fingerprint then raise exception 'stale schedule line-up share preview' using errcode='40001'; end if;
 for item in select * from jsonb_array_elements(model->'locations') loop
   insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(target_workspace_id,(item->>'id')::uuid,target_date,actor_user_id,actor_user_id)
   on conflict(workspace_id,location_id,lineup_date) do update set share_version=public.schedule_lineups.share_version+1,shared_at=shared_time,updated_by=actor_user_id,updated_at=shared_time
   returning * into ln;
   if ln.share_version=0 then update public.schedule_lineups set share_version=1,shared_at=shared_time where id=ln.id returning * into ln; end if;
   insert into public.schedule_lineup_snapshots(workspace_id,location_id,lineup_date,version_number,fingerprint,content,shared_by,shared_at)
   values(target_workspace_id,ln.location_id,target_date,ln.share_version,actual,item,actor_user_id,shared_time) returning id into saved_id;
   snapshot_ids:=array_append(snapshot_ids,saved_id);
 end loop;
 return jsonb_build_object('status','shared','workspace_id',target_workspace_id,'date',target_date,'location_ids',target_location_ids,'snapshot_ids',snapshot_ids,'shared_at',shared_time);
end; $$;

revoke all on function public.initialize_schedule_lineup_sections_after_workspace_insert(),
 public.get_schedule_lineup_service(uuid,uuid,date,uuid[],uuid[]),
 public.upsert_schedule_lineup_section_service(uuid,uuid,uuid,integer,jsonb),
 public.archive_schedule_lineup_section_service(uuid,uuid,uuid,integer),
 public.upsert_schedule_lineup_entry_service(uuid,uuid,uuid,date,uuid,integer,jsonb),
 public.delete_schedule_lineup_entry_service(uuid,uuid,uuid,integer),
 public.upsert_schedule_lineup_brief_service(uuid,uuid,uuid,date,uuid,integer,jsonb),
 public.preview_schedule_lineup_share_service(uuid,uuid,date,uuid[]),
 public.share_schedule_lineup_service(uuid,uuid,date,uuid[],text) from public,anon,authenticated;
grant execute on function public.get_schedule_lineup_service(uuid,uuid,date,uuid[],uuid[]),
 public.upsert_schedule_lineup_section_service(uuid,uuid,uuid,integer,jsonb),
 public.archive_schedule_lineup_section_service(uuid,uuid,uuid,integer),
 public.upsert_schedule_lineup_entry_service(uuid,uuid,uuid,date,uuid,integer,jsonb),
 public.delete_schedule_lineup_entry_service(uuid,uuid,uuid,integer),
 public.upsert_schedule_lineup_brief_service(uuid,uuid,uuid,date,uuid,integer,jsonb),
 public.preview_schedule_lineup_share_service(uuid,uuid,date,uuid[]),
 public.share_schedule_lineup_service(uuid,uuid,date,uuid[],text) to service_role;
