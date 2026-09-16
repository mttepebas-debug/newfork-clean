-- Employees follow announcements through their own active location assignments,
-- not through membership scope (employee memberships are usually all-location).
-- Members can acknowledge a visible announcement; the row stays listed.

create or replace function public.announcement_member_matches_locations_service(
 target_user_id uuid,target_workspace_id uuid,target_announcement_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.announcement_locations target where target.announcement_id=target_announcement_id)
 or exists(
  select 1 from public.workspace_memberships membership
  join public.workspace_roles role on role.id=membership.role_id
  where membership.workspace_id=target_workspace_id and membership.user_id=target_user_id and membership.status='active'
   and case when role.access_class='employee' then exists(
    select 1 from public.employee_profiles employee
    join public.employee_location_assignments assignment on assignment.employee_id=employee.id and assignment.workspace_id=employee.workspace_id and assignment.ended_at is null
    join public.announcement_locations target on target.announcement_id=target_announcement_id and target.location_id=assignment.location_id
    where employee.workspace_id=target_workspace_id and employee.user_id=target_user_id and employee.archived_at is null
   ) else membership.all_locations or exists(
    select 1 from public.membership_location_scopes scope
    join public.announcement_locations target on target.announcement_id=target_announcement_id and target.location_id=scope.location_id
    where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id
   ) end
 );
$$;
revoke all on function public.announcement_member_matches_locations_service(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create table public.announcement_acknowledgements(
 workspace_id uuid not null,
 announcement_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 acknowledged_at timestamptz not null default now(),
 primary key(announcement_id,user_id),
 foreign key(announcement_id,workspace_id) references public.announcements(id,workspace_id) on delete cascade
);
alter table public.announcement_acknowledgements enable row level security;
revoke all on public.announcement_acknowledgements from public,anon,authenticated;
grant select,insert,update,delete on public.announcement_acknowledgements to service_role;

create or replace function public.get_announcements_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_manage boolean; result jsonb;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read') then raise exception 'announcement access required' using errcode='42501'; end if;
 can_manage:=public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage');
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'can_manage',can_manage,
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name) from public.locations location where location.workspace_id=target_workspace_id and location.archived_at is null and public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read',location.id)),'[]'::jsonb),
  'departments',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.sort_order,d.name) from public.departments d where d.workspace_id=target_workspace_id and d.archived_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'jobs',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'department_id',j.department_id) order by j.sort_order,j.name) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'announcements',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',announcement.id,'workspace_id',announcement.workspace_id,'title',announcement.title,'body',announcement.body,
    'category',announcement.category,'status',announcement.status,'audience_roles',announcement.audience_roles,
    'location_ids',coalesce(targets.ids,'{}'::uuid[]),'location_names',coalesce(targets.names,'{}'::text[]),
    'department_ids',announcement.department_ids,'job_ids',announcement.job_ids,'archived_at',announcement.archived_at,
    'department_names',coalesce((select jsonb_agg(d.name order by array_position(announcement.department_ids,d.id)) from public.departments d where d.workspace_id=target_workspace_id and d.id=any(announcement.department_ids)),'[]'::jsonb),
    'job_names',coalesce((select jsonb_agg(j.name order by array_position(announcement.job_ids,j.id)) from public.jobs j where j.workspace_id=target_workspace_id and j.id=any(announcement.job_ids)),'[]'::jsonb),
    'publish_at',announcement.publish_at,'published_at',announcement.published_at,'expires_at',announcement.expires_at,
    'action_url',announcement.action_url,'author_name',coalesce(author.display_name,'Workspace member'),
    'revision',announcement.revision,'created_at',announcement.created_at,'updated_at',announcement.updated_at,
    'read_at',notification.read_at,
    'acknowledged_at',acknowledgement.acknowledged_at,
    'can_edit',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_publish',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_cancel',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.archived_at is null
   ) order by coalesce(announcement.publish_at,announcement.created_at) desc,announcement.id)
   from public.announcements announcement
   join public.user_profiles author on author.user_id=announcement.created_by
   join public.workspace_memberships viewer on viewer.workspace_id=target_workspace_id and viewer.user_id=actor_user_id and viewer.status='active'
   join public.workspace_roles viewer_role on viewer_role.id=viewer.role_id
   left join lateral(select array_agg(location.id order by location.sort_order) ids,array_agg(location.name order by location.sort_order) names from public.announcement_locations target join public.locations location on location.id=target.location_id where target.announcement_id=announcement.id) targets on true
   left join public.notifications notification on notification.recipient_user_id=actor_user_id and notification.source_type='announcement' and notification.source_id=announcement.id and notification.event_key='published'
   left join public.announcement_acknowledgements acknowledgement on acknowledgement.announcement_id=announcement.id and acknowledgement.user_id=actor_user_id
   where announcement.workspace_id=target_workspace_id
    and (
     public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id)
     or (
      announcement.archived_at is null and public.announcement_member_matches_jobs_service(actor_user_id,target_workspace_id,announcement.department_ids,announcement.job_ids)
      and announcement.status in('published','scheduled') and coalesce(announcement.publish_at,announcement.published_at)<=now()
      and (announcement.expires_at is null or announcement.expires_at>now()) and viewer_role.access_class=any(announcement.audience_roles)
      and public.announcement_member_matches_locations_service(actor_user_id,target_workspace_id,announcement.id)
     )
    )
  ),'[]'::jsonb)
 ) into result;
 return result;
end; $$;

create or replace function public.publish_announcement_service_legacy_notifications(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype; recipient_count integer; effective_at timestamptz;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
 if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
 if not public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) then raise exception 'announcement access denied' using errcode='42501'; end if;
 if announcement.revision<>target_expected_revision or announcement.status not in('draft','scheduled') then raise exception 'stale announcement revision' using errcode='40001'; end if;
 effective_at:=case when announcement.publish_at is not null and announcement.publish_at>now() then announcement.publish_at else now() end;
 update public.announcements set status=case when effective_at>now() then 'scheduled'::public.announcement_status else 'published'::public.announcement_status end,publish_at=effective_at,published_at=case when effective_at<=now() then now() else null end,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
 delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key,created_at)
 select target_workspace_id,membership.user_id,'announcement',announcement.title,left(announcement.body,2000),coalesce(announcement.action_url,'/app/announcements/'||announcement.id),'announcement',announcement.id,'published',effective_at
 from public.workspace_memberships membership join public.workspace_roles role on role.id=membership.role_id
 where membership.workspace_id=target_workspace_id and membership.status='active' and role.access_class=any(announcement.audience_roles)
  and public.announcement_member_matches_jobs_service(membership.user_id,target_workspace_id,announcement.department_ids,announcement.job_ids)
  and public.announcement_member_matches_locations_service(membership.user_id,target_workspace_id,announcement.id);
 get diagnostics recipient_count=row_count;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'announcement.published','announcement',announcement.id::text,jsonb_build_object('status',announcement.status,'recipient_count',recipient_count));
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',recipient_count);
end; $$;

create or replace function public.acknowledge_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare acknowledged timestamptz;
begin
 -- ponytail: reuse the read model as the visibility gate so both paths never drift.
 if not exists(
  select 1 from jsonb_array_elements(public.get_announcements_service(actor_user_id,target_workspace_id)->'announcements') item
  where item->>'id'=target_announcement_id::text and item->>'status' in('published','scheduled') and item->>'archived_at' is null
 ) then raise exception 'announcement not found' using errcode='P0002'; end if;
 insert into public.announcement_acknowledgements(workspace_id,announcement_id,user_id)
 values(target_workspace_id,target_announcement_id,actor_user_id)
 on conflict(announcement_id,user_id) do nothing;
 select acknowledged_at into acknowledged from public.announcement_acknowledgements where announcement_id=target_announcement_id and user_id=actor_user_id;
 return jsonb_build_object('status','saved','acknowledged_at',acknowledged);
end; $$;
revoke all on function public.acknowledge_announcement_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_announcement_service(uuid,uuid,uuid) to service_role;

NOTIFY pgrst, 'reload schema';
