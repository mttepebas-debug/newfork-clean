-- Catalog audience filters use AND across groups and OR within each group.
-- Empty role selections are stored as all access classes for compatibility.
alter table public.announcements
 add column department_ids uuid[] not null default '{}',
 add column job_ids uuid[] not null default '{}',
 add column archived_at timestamptz;

create or replace function public.announcement_member_matches_jobs_service(
 target_user_id uuid,target_workspace_id uuid,target_department_ids uuid[],target_job_ids uuid[]
) returns boolean language sql stable security definer set search_path='' as $$
 select
 (cardinality(target_department_ids)=0 or exists(
  select 1 from public.employee_profiles employee
  join public.employee_job_assignments assignment on assignment.employee_id=employee.id and assignment.workspace_id=employee.workspace_id and assignment.ended_at is null
  join public.jobs job on job.id=assignment.job_id and job.workspace_id=employee.workspace_id
  where employee.workspace_id=target_workspace_id and employee.user_id=target_user_id and employee.archived_at is null and job.archived_at is null and job.department_id=any(target_department_ids)
 )) and (cardinality(target_job_ids)=0 or exists(
  select 1 from public.employee_profiles employee
  join public.employee_job_assignments assignment on assignment.employee_id=employee.id and assignment.workspace_id=employee.workspace_id and assignment.ended_at is null
  join public.jobs job on job.id=assignment.job_id and job.workspace_id=employee.workspace_id
  where employee.workspace_id=target_workspace_id and employee.user_id=target_user_id and employee.archived_at is null and job.archived_at is null and job.id=any(target_job_ids)
 ));
$$;
revoke all on function public.announcement_member_matches_jobs_service(uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;


create or replace function public.save_announcement_audience_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer,target_title text,target_body text,target_category text,target_audience_roles text[],target_location_ids uuid[],target_publish_at timestamptz,target_expires_at timestamptz,target_action_url text,target_department_ids uuid[],target_job_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype; location_id uuid; next_status public.announcement_status:='draft'::public.announcement_status;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 target_department_ids:=coalesce(target_department_ids,'{}'::uuid[]);
 target_job_ids:=coalesce(target_job_ids,'{}'::uuid[]);
 target_location_ids:=coalesce(target_location_ids,'{}'::uuid[]);
 if coalesce(cardinality(target_audience_roles),0)=0 then target_audience_roles:=array['owner','admin','manager','employee']; end if;
 if cardinality(target_department_ids)>100 or cardinality(target_job_ids)>100 or cardinality(target_location_ids)>100 then raise exception 'too many audience filters' using errcode='22023'; end if;
 if exists(select 1 from unnest(target_department_ids) selected(id) where not exists(select 1 from public.departments d where d.id=selected.id and d.workspace_id=target_workspace_id and d.archived_at is null))
 or exists(select 1 from unnest(target_job_ids) selected(id) where not exists(select 1 from public.jobs j where j.id=selected.id and j.workspace_id=target_workspace_id and j.archived_at is null)) then raise exception 'active workspace department and job required' using errcode='22023'; end if;
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
  if not public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) then raise exception 'announcement access denied' using errcode='42501'; end if;
  if announcement.revision<>target_expected_revision then raise exception 'stale announcement revision' using errcode='40001'; end if;
  if announcement.status not in('draft','scheduled') then raise exception 'announcement can no longer be edited' using errcode='40001'; end if;
  next_status:=announcement.status;
  update public.announcements set title=btrim(target_title),body=btrim(target_body),category=target_category::public.announcement_category,audience_roles=array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),publish_at=target_publish_at,expires_at=target_expires_at,action_url=target_action_url,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
  delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 end if;
 delete from public.announcement_locations where announcement_id=announcement.id;
 insert into public.announcement_locations(workspace_id,announcement_id,location_id) select target_workspace_id,announcement.id,distinct_id from (select distinct unnest(target_location_ids) distinct_id) locations;
 update public.announcements set department_ids=array(select distinct unnest(target_department_ids)),job_ids=array(select distinct unnest(target_job_ids)) where id=announcement.id;
 if next_status='scheduled' then perform public.publish_announcement_service(actor_user_id,target_workspace_id,announcement.id,announcement.revision); select * into announcement from public.announcements where id=announcement.id; end if;
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',0);
end; $$;


create or replace function public.save_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer,target_title text,target_body text,target_category text,target_audience_roles text[],target_location_ids uuid[],target_publish_at timestamptz,target_expires_at timestamptz,target_action_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_departments uuid[]; selected_jobs uuid[];
begin
 select department_ids,job_ids into selected_departments,selected_jobs from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
 return public.save_announcement_audience_service(actor_user_id,target_workspace_id,target_announcement_id,target_expected_revision,target_title,target_body,target_category,target_audience_roles,target_location_ids,target_publish_at,target_expires_at,target_action_url,coalesce(selected_departments,'{}'::uuid[]),coalesce(selected_jobs,'{}'::uuid[]));
end; $$;
revoke all on function public.save_announcement_audience_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.save_announcement_audience_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text,uuid[],uuid[]) to service_role;


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
   where announcement.workspace_id=target_workspace_id
    and (
     public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id)
     or (
      announcement.archived_at is null and public.announcement_member_matches_jobs_service(actor_user_id,target_workspace_id,announcement.department_ids,announcement.job_ids)
      and announcement.status in('published','scheduled') and coalesce(announcement.publish_at,announcement.published_at)<=now()
      and (announcement.expires_at is null or announcement.expires_at>now()) and viewer_role.access_class=any(announcement.audience_roles)
      and (targets.ids is null or viewer.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=viewer.id and scope.location_id=any(targets.ids)))
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
  and (not exists(select 1 from public.announcement_locations target where target.announcement_id=announcement.id) or membership.all_locations or exists(select 1 from public.membership_location_scopes scope join public.announcement_locations target on target.location_id=scope.location_id and target.announcement_id=announcement.id where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id));
 get diagnostics recipient_count=row_count;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'announcement.published','announcement',announcement.id::text,jsonb_build_object('status',announcement.status,'recipient_count',recipient_count));
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',recipient_count);
end; $$;

create or replace function public.cancel_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
 if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
 if not public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) then raise exception 'announcement access denied' using errcode='42501'; end if;
 if announcement.revision<>target_expected_revision or announcement.archived_at is not null then raise exception 'stale announcement revision' using errcode='40001'; end if;
 update public.announcements set status='cancelled',archived_at=now(),revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
 delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id) values(target_workspace_id,actor_user_id,'announcement.cancelled','announcement',announcement.id::text);
 return jsonb_build_object('status','cancelled','announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',0);
end; $$;

NOTIFY pgrst, 'reload schema';
