-- Document restrictions are tenant-specific, derived at request time, and never
-- modify authentication or the employee's membership.
create function app_private.document_actor_blocked(actor uuid,w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_onboarding_requirements r
 join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id and e.user_id=actor and e.archived_at is null
 join public.workspace_memberships m on m.workspace_id=w and m.user_id=actor and m.status='active'
 where r.workspace_id=w and r.lifecycle_user_id=actor and app_private.document_obligation_blocked(r,now()));
$$;
revoke all on function app_private.document_actor_blocked(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_employee_document_access_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspace_memberships where user_id=actor_user_id and workspace_id=target_workspace_id and status in ('active','pending_activation'))
  or not app_private.workspace_allows_interactive_access(target_workspace_id)
 then raise exception 'workspace unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('restricted',app_private.document_actor_blocked(actor_user_id,target_workspace_id));
end;
$$;
revoke all on function public.get_employee_document_access_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_employee_document_access_service(uuid,uuid) to service_role;

-- Wrap existing canonical permission/RLS helper bodies in place. Account-owned
-- profile, workspace listing/switching, document self RPCs and legal evidence use
-- their existing explicit actor/membership checks, not a broad bypass flag.
do $$
declare proc regprocedure; body text; marker text;
begin
 foreach proc in array array[
  'public.service_actor_has_permission(uuid,uuid,text)'::regprocedure,
  'app_private.is_workspace_member(uuid)'::regprocedure,
  'app_private.can_access_location(uuid,uuid)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  marker:='select exists';
  if strpos(lower(body),marker)=0 then raise exception 'document authorization helper anchor changed: %',proc; end if;
  body:=overlay(body placing case when proc::text like 'service_actor_has_permission%' or proc::text like 'public.service_actor_has_permission%'
   then 'select not app_private.document_actor_blocked(actor_user_id,target_workspace_id) and exists'
   else 'select not app_private.document_actor_blocked((select auth.uid()),target_workspace_id) and exists' end
   from strpos(lower(body),marker) for char_length(marker));
  execute body;
 end loop;
 body:=pg_get_functiondef('app_private.workspace_role_for(uuid)'::regprocedure);
 marker:='membership.status = ''active''';
 if strpos(body,marker)=0 then raise exception 'document role helper anchor changed'; end if;
 body:=replace(body,marker,marker||' and not app_private.document_actor_blocked((select auth.uid()),target_workspace_id)');
 execute body;
end;
$$;
