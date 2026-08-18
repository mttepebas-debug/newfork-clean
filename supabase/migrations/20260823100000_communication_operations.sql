create type public.announcement_status as enum('draft','scheduled','published','cancelled');
create type public.announcement_category as enum('general','operations','schedule');
create type public.notification_category as enum('announcement','request','schedule');

create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace.id,
    workspace.name,
    membership.role,
    coalesce(workspace.id = preference.active_workspace_id, false),
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by coalesce(workspace.id = preference.active_workspace_id, false) desc, workspace.name asc;
$$;

insert into public.permissions(key,label,category,description,custom_grantable,sort_order) values
 ('announcements.read','View announcements','Communication','View announcements for the active role and location scope.',true,210),
 ('announcements.manage','Manage announcements','Communication','Create, publish, and cancel scoped announcements.',true,220),
 ('notifications.read','View notifications','Communication','View and manage personal in-app notifications.',true,230)
on conflict(key) do nothing;

insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select role.workspace_id,role.id,permission.key
from public.workspace_roles role
cross join (values('announcements.read'),('announcements.manage'),('notifications.read')) permission(key)
where role.system_key in('owner','admin','manager')
on conflict do nothing;

insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select role.workspace_id,role.id,permission.key
from public.workspace_roles role
cross join (values('announcements.read'),('notifications.read')) permission(key)
where role.system_key='employee'
on conflict do nothing;

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
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select target_workspace_id,owner_role_id,key from public.permissions on conflict do nothing;
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select target_workspace_id,admin_role_id,key from public.permissions on conflict do nothing;
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) values
  (target_workspace_id,manager_role_id,'workspace.read'),(target_workspace_id,manager_role_id,'schedule.read'),
  (target_workspace_id,manager_role_id,'schedule.manage'),(target_workspace_id,manager_role_id,'schedule.publish'),
  (target_workspace_id,manager_role_id,'schedule.templates.manage'),(target_workspace_id,manager_role_id,'schedule.export'),
  (target_workspace_id,manager_role_id,'schedule.lineup.read'),(target_workspace_id,manager_role_id,'schedule.lineup.manage'),
  (target_workspace_id,manager_role_id,'schedule.lineup.share'),(target_workspace_id,manager_role_id,'schedule.time_off_requests.read'),
  (target_workspace_id,manager_role_id,'schedule.time_off_requests.manage'),(target_workspace_id,manager_role_id,'schedule.shift_change_requests.read'),
  (target_workspace_id,manager_role_id,'schedule.shift_change_requests.manage'),(target_workspace_id,manager_role_id,'employees.read'),
  (target_workspace_id,manager_role_id,'employees.manage'),(target_workspace_id,manager_role_id,'employee_onboarding.review'),
  (target_workspace_id,manager_role_id,'announcements.read'),
  (target_workspace_id,manager_role_id,'announcements.manage'),(target_workspace_id,manager_role_id,'notifications.read'),
  (target_workspace_id,employee_role_id,'workspace.read'),(target_workspace_id,employee_role_id,'schedule.read'),
  (target_workspace_id,employee_role_id,'announcements.read'),(target_workspace_id,employee_role_id,'notifications.read')
 on conflict do nothing;
end; $$;

create table public.announcements(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 120),
 body text not null check(char_length(btrim(body)) between 1 and 5000),
 category public.announcement_category not null default 'general',
 status public.announcement_status not null default 'draft',
 audience_roles public.workspace_role[] not null default array['owner','admin','manager','employee']::public.workspace_role[],
 publish_at timestamptz,
 published_at timestamptz,
 expires_at timestamptz,
 action_url text check(action_url is null or (char_length(action_url)<=500 and action_url ~ '^/app(/|$)')),
 revision integer not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 check(cardinality(audience_roles) between 1 and 4),
 check(expires_at is null or publish_at is null or expires_at>publish_at)
);
create index announcements_workspace_status_idx on public.announcements(workspace_id,status,publish_at desc,created_at desc);

create table public.announcement_locations(
 workspace_id uuid not null,
 announcement_id uuid not null,
 location_id uuid not null,
 primary key(announcement_id,location_id),
 foreign key(announcement_id,workspace_id) references public.announcements(id,workspace_id) on delete cascade,
 foreign key(location_id,workspace_id) references public.locations(id,workspace_id) on delete restrict
);

create table public.notifications(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 category public.notification_category not null,
 title text not null check(char_length(btrim(title)) between 1 and 160),
 body text not null default '' check(char_length(body)<=2000),
 action_url text check(action_url is null or (char_length(action_url)<=500 and action_url ~ '^/app(/|$)')),
 source_type text not null check(char_length(btrim(source_type)) between 1 and 80),
 source_id uuid,
 event_key text not null default 'default' check(char_length(btrim(event_key)) between 1 and 80),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 dismissed_at timestamptz,
 unique(recipient_user_id,source_type,source_id,event_key)
);
create index notifications_recipient_inbox_idx on public.notifications(workspace_id,recipient_user_id,created_at desc) where dismissed_at is null;

create table public.workspace_layout_preferences(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 widget_order text[] not null,
 hidden_widget_ids text[] not null default '{}',
 updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_locations enable row level security;
alter table public.notifications enable row level security;
alter table public.workspace_layout_preferences enable row level security;
revoke all on public.announcements,public.announcement_locations,public.notifications,public.workspace_layout_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.announcements,public.announcement_locations,public.notifications,public.workspace_layout_preferences to service_role;

create function public.communication_actor_has_capability_service(actor_user_id uuid,target_workspace_id uuid,capability text,target_location_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.workspace_memberships membership
  join public.workspace_roles role on role.id=membership.role_id and role.workspace_id=membership.workspace_id
  join public.workspace_role_permissions permission on permission.role_id=role.id and permission.workspace_id=role.workspace_id
  where membership.workspace_id=target_workspace_id and membership.user_id=actor_user_id and membership.status='active'
   and permission.permission_key=capability
   and (target_location_id is null or membership.all_locations or exists(
    select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id and scope.location_id=target_location_id))
 );
$$;

create function public.communication_actor_has_all_locations_service(actor_user_id uuid,target_workspace_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_memberships membership where membership.user_id=actor_user_id and membership.workspace_id=target_workspace_id and membership.status='active' and membership.all_locations);
$$;

create function public.communication_actor_can_control_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') and exists(
  select 1 from public.workspace_memberships membership
  where membership.user_id=actor_user_id and membership.workspace_id=target_workspace_id and membership.status='active'
   and (
    membership.all_locations
    or (
     exists(select 1 from public.announcement_locations target where target.announcement_id=target_announcement_id)
     and not exists(
      select 1 from public.announcement_locations target
      where target.announcement_id=target_announcement_id and not exists(
       select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id and scope.location_id=target.location_id
      )
     )
    )
   )
 );
$$;

create function public.get_announcements_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_manage boolean; result jsonb;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read') then raise exception 'announcement access required' using errcode='42501'; end if;
 can_manage:=public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage');
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'can_manage',can_manage,
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name) from public.locations location where location.workspace_id=target_workspace_id and location.archived_at is null and public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read',location.id)),'[]'::jsonb),
  'announcements',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',announcement.id,'workspace_id',announcement.workspace_id,'title',announcement.title,'body',announcement.body,
    'category',announcement.category,'status',announcement.status,'audience_roles',announcement.audience_roles,
    'location_ids',coalesce(targets.ids,'{}'::uuid[]),'location_names',coalesce(targets.names,'{}'::text[]),
    'publish_at',announcement.publish_at,'published_at',announcement.published_at,'expires_at',announcement.expires_at,
    'action_url',announcement.action_url,'author_name',coalesce(author.display_name,'Workspace member'),
    'revision',announcement.revision,'created_at',announcement.created_at,'updated_at',announcement.updated_at,
    'read_at',notification.read_at,
    'can_edit',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_publish',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_cancel',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('scheduled','published')
   ) order by coalesce(announcement.publish_at,announcement.created_at) desc,announcement.id)
   from public.announcements announcement
   join public.user_profiles author on author.user_id=announcement.created_by
   join public.workspace_memberships viewer on viewer.workspace_id=target_workspace_id and viewer.user_id=actor_user_id and viewer.status='active'
   join public.workspace_roles viewer_role on viewer_role.id=viewer.role_id
   left join lateral(select array_agg(location.id order by location.sort_order) ids,array_agg(location.name order by location.sort_order) names from public.announcement_locations target join public.locations location on location.id=target.location_id where target.announcement_id=announcement.id) targets on true
   left join public.notifications notification on notification.recipient_user_id=actor_user_id and notification.source_type='announcement' and notification.source_id=announcement.id and notification.event_key='published'
   where announcement.workspace_id=target_workspace_id
    and (
     public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id)
     or (
      announcement.status in('published','scheduled') and coalesce(announcement.publish_at,announcement.published_at)<=now()
      and (announcement.expires_at is null or announcement.expires_at>now()) and viewer_role.access_class=any(announcement.audience_roles)
      and (targets.ids is null or viewer.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=viewer.id and scope.location_id=any(targets.ids)))
     )
    )
  ),'[]'::jsonb)
 ) into result;
 return result;
end; $$;

create function public.save_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer,target_title text,target_body text,target_category text,target_audience_roles text[],target_location_ids uuid[],target_publish_at timestamptz,target_expires_at timestamptz,target_action_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype; location_id uuid; next_status public.announcement_status:='draft';
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000 or target_category not in('general','operations','schedule') then raise exception 'valid announcement content required' using errcode='22023'; end if;
 if cardinality(target_audience_roles) not between 1 and 4 or exists(select 1 from unnest(target_audience_roles) role_name where role_name not in('owner','admin','manager','employee')) then raise exception 'valid announcement audience required' using errcode='22023'; end if;
 if target_action_url is not null and (char_length(target_action_url)>500 or target_action_url!~'^/app(/|$)') then raise exception 'valid app action required' using errcode='22023'; end if;
 if target_expires_at is not null and target_publish_at is not null and target_expires_at<=target_publish_at then raise exception 'expiry must follow publication' using errcode='22023'; end if;
 if cardinality(target_location_ids)=0 and not public.communication_actor_has_all_locations_service(actor_user_id,target_workspace_id) then raise exception 'all-location announcement access required' using errcode='42501'; end if;
 foreach location_id in array target_location_ids loop
  if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage',location_id) or not exists(select 1 from public.locations where id=location_id and workspace_id=target_workspace_id and archived_at is null) then raise exception 'announcement location access denied' using errcode='42501'; end if;
 end loop;
 if target_announcement_id is null then
  insert into public.announcements(workspace_id,title,body,category,audience_roles,publish_at,expires_at,action_url,created_by,updated_by)
  values(target_workspace_id,btrim(target_title),btrim(target_body),target_category::public.announcement_category,array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),target_publish_at,target_expires_at,target_action_url,actor_user_id,actor_user_id) returning * into announcement;
 else
  select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
  if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
  if announcement.revision<>target_expected_revision then raise exception 'stale announcement revision' using errcode='40001'; end if;
  if announcement.status not in('draft','scheduled') then raise exception 'announcement can no longer be edited' using errcode='40001'; end if;
  next_status:=announcement.status;
  update public.announcements set title=btrim(target_title),body=btrim(target_body),category=target_category::public.announcement_category,audience_roles=array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),publish_at=target_publish_at,expires_at=target_expires_at,action_url=target_action_url,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
  delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 end if;
 delete from public.announcement_locations where announcement_id=announcement.id;
 insert into public.announcement_locations(workspace_id,announcement_id,location_id) select target_workspace_id,announcement.id,distinct_id from (select distinct unnest(target_location_ids) distinct_id) locations;
 if next_status='scheduled' then perform public.publish_announcement_service(actor_user_id,target_workspace_id,announcement.id,announcement.revision); select * into announcement from public.announcements where id=announcement.id; end if;
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',0);
end; $$;

create function public.publish_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype; recipient_count integer; effective_at timestamptz;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
 if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
 if announcement.revision<>target_expected_revision or announcement.status not in('draft','scheduled') then raise exception 'stale announcement revision' using errcode='40001'; end if;
 effective_at:=case when announcement.publish_at is not null and announcement.publish_at>now() then announcement.publish_at else now() end;
 update public.announcements set status=case when effective_at>now() then 'scheduled'::public.announcement_status else 'published'::public.announcement_status end,publish_at=effective_at,published_at=case when effective_at<=now() then now() else null end,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
 delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key,created_at)
 select target_workspace_id,membership.user_id,'announcement',announcement.title,left(announcement.body,2000),coalesce(announcement.action_url,'/app/announcements/'||announcement.id),'announcement',announcement.id,'published',effective_at
 from public.workspace_memberships membership join public.workspace_roles role on role.id=membership.role_id
 where membership.workspace_id=target_workspace_id and membership.status='active' and role.access_class=any(announcement.audience_roles)
  and (not exists(select 1 from public.announcement_locations target where target.announcement_id=announcement.id) or membership.all_locations or exists(select 1 from public.membership_location_scopes scope join public.announcement_locations target on target.location_id=scope.location_id and target.announcement_id=announcement.id where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id));
 get diagnostics recipient_count=row_count;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'announcement.published','announcement',announcement.id::text,jsonb_build_object('status',announcement.status,'recipient_count',recipient_count));
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',recipient_count);
end; $$;

create function public.cancel_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
 if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
 if announcement.revision<>target_expected_revision or announcement.status not in('scheduled','published') then raise exception 'stale announcement revision' using errcode='40001'; end if;
 update public.announcements set status='cancelled',revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
 delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id) values(target_workspace_id,actor_user_id,'announcement.cancelled','announcement',announcement.id::text);
 return jsonb_build_object('status','cancelled','announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',0);
end; $$;

create function public.get_notifications_service(actor_user_id uuid,target_workspace_id uuid,target_category text default null,target_unread_only boolean default false,target_cursor timestamptz default null,target_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'notifications.read') then raise exception 'notification access required' using errcode='42501'; end if;
 if target_category is not null and target_category not in('announcement','request','schedule') then raise exception 'valid notification category required' using errcode='22023'; end if;
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'unread_count',(select count(*) from public.notifications where workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null and read_at is null and created_at<=now()),
  'next_cursor',(select min(page.created_at) from (select notification.created_at from public.notifications notification where notification.workspace_id=target_workspace_id and notification.recipient_user_id=actor_user_id and notification.dismissed_at is null and notification.created_at<=now() and (target_category is null or notification.category::text=target_category) and (not target_unread_only or notification.read_at is null) and (target_cursor is null or notification.created_at<target_cursor) order by notification.created_at desc,notification.id limit greatest(1,least(target_limit,50))+1) page having count(*)>greatest(1,least(target_limit,50))),
  'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',page.id,'workspace_id',page.workspace_id,'category',page.category,'title',page.title,'body',page.body,'action_url',page.action_url,'source_type',page.source_type,'source_id',page.source_id,'created_at',page.created_at,'read_at',page.read_at) order by page.created_at desc,page.id) from (select notification.* from public.notifications notification where notification.workspace_id=target_workspace_id and notification.recipient_user_id=actor_user_id and notification.dismissed_at is null and notification.created_at<=now() and (target_category is null or notification.category::text=target_category) and (not target_unread_only or notification.read_at is null) and (target_cursor is null or notification.created_at<target_cursor) order by notification.created_at desc,notification.id limit greatest(1,least(target_limit,50))) page),'[]'::jsonb)
 ) into result;
 return result;
end; $$;

create function public.act_on_notification_service(actor_user_id uuid,target_workspace_id uuid,target_notification_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'notifications.read') then raise exception 'notification access required' using errcode='42501'; end if;
 if target_action='read_all' then update public.notifications set read_at=coalesce(read_at,now()) where workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null and created_at<=now();
 elsif target_notification_id is null then raise exception 'notification id required' using errcode='22023';
 elsif target_action='read' then update public.notifications set read_at=coalesce(read_at,now()) where id=target_notification_id and workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null;
 elsif target_action='unread' then update public.notifications set read_at=null where id=target_notification_id and workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null;
 elsif target_action='dismiss' then update public.notifications set dismissed_at=now() where id=target_notification_id and workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null;
 else raise exception 'unsupported notification action' using errcode='22023'; end if;
 get diagnostics affected=row_count;
 if target_action<>'read_all' and affected=0 then raise exception 'notification not found' using errcode='P0002'; end if;
 return jsonb_build_object('status','saved','affected',affected);
end; $$;

create function public.save_workspace_layout_service(actor_user_id uuid,target_workspace_id uuid,target_widget_order text[],target_hidden_widget_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed constant text[]:=array['operations','pending_requests','open_shifts','announcements','notifications','quick_actions'];
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'workspace.read') then raise exception 'workspace access required' using errcode='42501'; end if;
 if cardinality(target_widget_order)<>6 or (select count(distinct value) from unnest(target_widget_order) value)<>6 or exists(select 1 from unnest(target_widget_order||target_hidden_widget_ids) value where not value=any(allowed)) then raise exception 'valid workspace layout required' using errcode='22023'; end if;
 insert into public.workspace_layout_preferences(workspace_id,user_id,widget_order,hidden_widget_ids) values(target_workspace_id,actor_user_id,target_widget_order,array(select distinct value from unnest(target_hidden_widget_ids) value))
 on conflict(workspace_id,user_id) do update set widget_order=excluded.widget_order,hidden_widget_ids=excluded.hidden_widget_ids,updated_at=now();
 return jsonb_build_object('status','saved');
end; $$;

create function public.get_workspace_dashboard_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare membership public.workspace_memberships%rowtype; role_class public.workspace_role; result jsonb;
begin
 select member.* into membership from public.workspace_memberships member where member.user_id=actor_user_id and member.workspace_id=target_workspace_id and member.status='active';
 select role.access_class into role_class from public.workspace_roles role where role.id=membership.role_id and role.workspace_id=target_workspace_id;
 if membership.id is null or role_class='employee' or not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'workspace.read') then raise exception 'manager workspace access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'workspace_id',target_workspace_id,'display_name',coalesce(profile.display_name,'Manager'),
  'metrics',jsonb_build_object(
   'today_shift_count',(select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current' where shift.workspace_id=target_workspace_id and shift.scheduled_date=current_date and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=shift.location_id))),
   'today_open_shift_count',(select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current' where shift.workspace_id=target_workspace_id and shift.scheduled_date=current_date and shift.employee_id is null and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=shift.location_id))),
   'pending_time_off_count',(select count(*) from public.schedule_time_off_requests request where request.workspace_id=target_workspace_id and request.status='pending' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=request.location_id))),
   'pending_shift_change_count',(select count(*) from public.schedule_shift_change_requests request join public.schedule_published_shifts shift on shift.id=request.offered_shift_id where request.workspace_id=target_workspace_id and request.status='pending_manager_approval' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=shift.location_id))),
   'unread_notification_count',(select count(*) from public.notifications notification where notification.workspace_id=target_workspace_id and notification.recipient_user_id=actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at<=now())
  ),
  'announcements',coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id,target_workspace_id)->'announcements')) value where value->>'status' in('published','scheduled') and (value->>'publish_at')::timestamptz<=now() limit 5) item),'[]'::jsonb),
  'notifications',coalesce(public.get_notifications_service(actor_user_id,target_workspace_id,null,false,null,5)->'notifications','[]'::jsonb),
  'layout',jsonb_build_object('widget_order',coalesce(preference.widget_order,array['operations','pending_requests','open_shifts','announcements','notifications','quick_actions']),'hidden_widget_ids',coalesce(preference.hidden_widget_ids,'{}'::text[]))
 ) into result
 from public.user_profiles profile left join public.workspace_layout_preferences preference on preference.workspace_id=target_workspace_id and preference.user_id=actor_user_id where profile.user_id=actor_user_id;
 return result;
end; $$;

create function public.notify_schedule_request_event_service()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_location_id uuid; event_employee_id uuid;
begin
 if tg_table_name='schedule_time_off_events' then
  select request.location_id,request.employee_id into event_location_id,event_employee_id from public.schedule_time_off_requests request where request.id=new.request_id;
 else
  select shift.location_id into event_location_id from public.schedule_shift_change_requests request join public.schedule_published_shifts shift on shift.id=request.offered_shift_id where request.id=new.request_id;
 end if;
 if new.action='submitted' then
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key,created_at)
  select new.workspace_id,membership.user_id,'request',case when tg_table_name='schedule_time_off_events' then 'New time-off request' else 'New shift request' end,'A schedule request needs manager review.','/app/schedule/requests',tg_table_name,new.id,new.action,new.created_at
  from public.workspace_memberships membership join public.workspace_roles role on role.id=membership.role_id join public.workspace_role_permissions permission on permission.role_id=role.id
  where membership.workspace_id=new.workspace_id and membership.status='active' and permission.permission_key=case when tg_table_name='schedule_time_off_events' then 'schedule.time_off_requests.read' else 'schedule.shift_change_requests.read' end and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.location_id=event_location_id))
  on conflict do nothing;
 elsif new.action not in('viewed','returned_to_pending') then
  if tg_table_name='schedule_time_off_events' then
   insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key,created_at)
   select new.workspace_id,employee.user_id,'request','Time-off request updated','Your time-off request status changed.','/app/employee-hub/my-availability',tg_table_name,new.id,new.action,new.created_at from public.employee_profiles employee where employee.id=event_employee_id and employee.user_id is not null and employee.user_id<>new.actor_user_id on conflict do nothing;
  else
   insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key,created_at)
   select new.workspace_id,employee.user_id,'request','Shift request updated','A shift request involving you changed.','/app/employee-hub/shift-hub',tg_table_name,new.id,new.action,new.created_at from public.schedule_shift_change_participants participant join public.employee_profiles employee on employee.id=participant.employee_id where participant.request_id=new.request_id and employee.user_id is not null and employee.user_id<>new.actor_user_id on conflict do nothing;
  end if;
 end if;
 return new;
end; $$;

create trigger notify_time_off_event after insert on public.schedule_time_off_events for each row execute function public.notify_schedule_request_event_service();
create trigger notify_shift_change_event after insert on public.schedule_shift_change_events for each row execute function public.notify_schedule_request_event_service();

revoke all on function public.communication_actor_has_capability_service(uuid,uuid,text,uuid),public.communication_actor_has_all_locations_service(uuid,uuid),public.communication_actor_can_control_announcement_service(uuid,uuid,uuid),public.get_announcements_service(uuid,uuid),public.save_announcement_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text),public.publish_announcement_service(uuid,uuid,uuid,integer),public.cancel_announcement_service(uuid,uuid,uuid,integer),public.get_notifications_service(uuid,uuid,text,boolean,timestamptz,integer),public.act_on_notification_service(uuid,uuid,uuid,text),public.save_workspace_layout_service(uuid,uuid,text[],text[]),public.get_workspace_dashboard_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.communication_actor_has_capability_service(uuid,uuid,text,uuid),public.communication_actor_has_all_locations_service(uuid,uuid),public.communication_actor_can_control_announcement_service(uuid,uuid,uuid),public.get_announcements_service(uuid,uuid),public.save_announcement_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text),public.publish_announcement_service(uuid,uuid,uuid,integer),public.cancel_announcement_service(uuid,uuid,uuid,integer),public.get_notifications_service(uuid,uuid,text,boolean,timestamptz,integer),public.act_on_notification_service(uuid,uuid,uuid,text),public.save_workspace_layout_service(uuid,uuid,text[],text[]),public.get_workspace_dashboard_service(uuid,uuid) to service_role;
