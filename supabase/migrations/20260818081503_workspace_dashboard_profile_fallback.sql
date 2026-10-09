create or replace function public.get_workspace_dashboard_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare membership public.workspace_memberships%rowtype; role_class public.workspace_role; result jsonb;
begin
 select member.* into membership from public.workspace_memberships member where member.user_id=actor_user_id and member.workspace_id=target_workspace_id and member.status='active';
 select role.access_class into role_class from public.workspace_roles role where role.id=membership.role_id and role.workspace_id=target_workspace_id;
 if membership.id is null or role_class='employee' or not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'workspace.read') then raise exception 'manager workspace access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'display_name',coalesce((select profile.display_name from public.user_profiles profile where profile.user_id=actor_user_id),'Manager'),
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
 from (select 1) anchor
 left join public.workspace_layout_preferences preference on preference.workspace_id=target_workspace_id and preference.user_id=actor_user_id;
 return result;
end; $$;

revoke all on function public.get_workspace_dashboard_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_workspace_dashboard_service(uuid,uuid) to service_role;
