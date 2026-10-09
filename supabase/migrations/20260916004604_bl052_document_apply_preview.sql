create function app_private.document_definition_snapshot(d public.document_types)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('document_type_id',d.id,'accepted_formats',d.accepted_formats,'tracks_expiry',d.tracks_expiry,'requires_review',d.requires_review);
$$;
revoke all on function app_private.document_definition_snapshot(public.document_types) from public,anon,authenticated,service_role;

create function public.preview_document_definition_apply_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.document_types%rowtype; rows jsonb; token text;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 with candidates as (
  select e.id,e.first_name,e.last_name,e.revision as employee_revision,r,
   d.archived_at is null and app_private.document_target_matches(e.workspace_id,e.id,d.lifecycle_settings->'target') as matches,
   m.status as membership_status
  from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
  left join public.employee_onboarding_requirements r on r.workspace_id=e.workspace_id and r.employee_id=e.id and r.source_id=d.id and r.kind='document'
  where e.workspace_id=target_workspace_id and e.archived_at is null and m.status in ('active','pending_activation')
   and public.service_actor_can_access_employee(actor_user_id,e.workspace_id,e.id)
 ), effects as (
  select *,case when (r).lifecycle_exempt then 'exempt'
   when not matches and (r).id is not null and (r).lifecycle_closed_at is null then 'remove'
   when matches and (r).id is null and (membership_status='pending_activation' or d.lifecycle_settings->>'assignment_scope'='all_active') then 'assign'
   when matches and ((r).lifecycle_closed_at is not null or (r).status='superseded') then 'reopen'
   when matches and (r).id is not null and ((r).lifecycle_settings is distinct from d.lifecycle_settings or (r).source_snapshot is distinct from app_private.document_definition_snapshot(d)
    or (r).title is distinct from d.title or (r).description is distinct from d.description) then 'update'
   else 'unchanged' end as action
  from candidates
 ) select coalesce(jsonb_agg(jsonb_build_object('employee_id',id,'employee_name',concat_ws(' ',first_name,last_name),'employee_revision',employee_revision,
   'requirement_id',(r).id,'revision',(r).lifecycle_revision,'action',action,
   'deadline_action',case when action in ('remove','exempt') or d.lifecycle_settings->>'mode'='optional' then 'clear'
    when action in ('assign','reopen') then 'restart'
    when action='update' and ((r).lifecycle_settings->>'mode',(r).lifecycle_settings->>'period_days',(r).lifecycle_settings->>'suspend_on_overdue')
      is distinct from (d.lifecycle_settings->>'mode',d.lifecycle_settings->>'period_days',d.lifecycle_settings->>'suspend_on_overdue') then 'restart'
    else 'preserve' end) order by id),'[]') into rows from effects;
 token:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor_user_id,'definition',to_jsonb(d),'employees',rows)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('revision',d.lifecycle_revision,'preview_token',token,'employees',rows);
end;
$$;
revoke all on function public.preview_document_definition_apply_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.preview_document_definition_apply_service(uuid,uuid,uuid) to service_role;

create function public.apply_document_definition_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,expected_preview_token text,apply_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.document_types%rowtype; preview jsonb; item jsonb; r public.employee_onboarding_requirements%rowtype;
 case_id uuid; member public.workspace_memberships%rowtype; deadline timestamptz; applied integer:=0; valid_approved boolean;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 if nullif(btrim(apply_reason),'') is null or char_length(apply_reason)>500 then raise exception 'application reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
 if d.id is null or d.lifecycle_revision is distinct from expected_revision then raise exception 'document type changed; refresh required' using errcode='PT409'; end if;
 -- Lock every scoped input that contributes to this preview before revalidation.
 perform 1 from public.employee_profiles e where e.workspace_id=target_workspace_id and public.service_actor_can_access_employee(actor_user_id,e.workspace_id,e.id) order by e.id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id order by id for update;
 preview:=public.preview_document_definition_apply_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'document impact changed; refresh preview' using errcode='PT409'; end if;
 for item in select value from jsonb_array_elements(preview->'employees') where value->>'action' in ('assign','update','reopen','remove') loop
  select m.* into member from public.workspace_memberships m join public.employee_profiles e on e.workspace_id=m.workspace_id and e.user_id=m.user_id
   where e.id=(item->>'employee_id')::uuid and m.workspace_id=target_workspace_id;
  if item->>'action'='assign' then
   insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id,status,approved_at,approved_by)
   values(target_workspace_id,(item->>'employee_id')::uuid,member.id,
    case when member.status='active' then 'approved'::public.employee_onboarding_case_status else 'in_progress'::public.employee_onboarding_case_status end,
    case when member.status='active' then now() end,case when member.status='active' then actor_user_id end)
   on conflict(employee_id) do nothing;
   select id into case_id from public.employee_onboarding_cases where workspace_id=target_workspace_id and employee_id=(item->>'employee_id')::uuid;
   insert into public.employee_onboarding_requirements(workspace_id,employee_id,case_id,kind,source_id,title,description,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_settings)
   values(target_workspace_id,(item->>'employee_id')::uuid,case_id,'document',d.id,d.title,d.description,d.lifecycle_settings->>'mode'='required',d.lifecycle_settings->>'mode'='required',d.requires_review,100+d.sort_order,app_private.document_definition_snapshot(d),d.lifecycle_settings)
   returning * into r;
  else
   select * into r from public.employee_onboarding_requirements where id=(item->>'requirement_id')::uuid;
   deadline:=r.deadline_at;
   r.lifecycle_closed_at:=null; if r.status='superseded' then r.status:='not_started'; end if;
   valid_approved:=app_private.document_obligation_state(r,now())='completed';
   if item->>'deadline_action'='clear' or valid_approved then deadline:=null;
   elsif item->>'deadline_action'='restart' then
    deadline:=case when member.status='active' and d.lifecycle_settings->>'period_days' is not null then now()+(d.lifecycle_settings->>'period_days')::integer*interval '24 hours' end;
   end if;
   update public.employee_onboarding_requirements set
    title=d.title,description=d.description,source_snapshot=app_private.document_definition_snapshot(d),lifecycle_settings=d.lifecycle_settings,
    required=d.lifecycle_settings->>'mode'='required',blocks_activation=d.lifecycle_settings->>'mode'='required',requires_review=d.requires_review,
    lifecycle_closed_at=case when item->>'action'='remove' then now() end,lifecycle_close_reason=case when item->>'action'='remove' then btrim(apply_reason) end,
    status=case when item->>'action'='reopen' and status='superseded' then 'not_started'::public.employee_onboarding_requirement_status else status end,
    deadline_at=deadline,paused_remaining_seconds=case when item->>'deadline_action'='preserve' then paused_remaining_seconds end,
    document_suspended_at=case when item->>'action'='remove' or d.lifecycle_settings->>'mode'='optional' or not (d.lifecycle_settings->>'suspend_on_overdue')::boolean then null else document_suspended_at end,
    lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning * into r;
  end if;
  perform app_private.document_audit(r,actor_user_id,'document.definition_applied',jsonb_build_object('reason',btrim(apply_reason),'definition_revision',d.lifecycle_revision,'action',item->>'action','revision',r.lifecycle_revision,'deadline_action',item->>'deadline_action'));
  applied:=applied+1;
 end loop;
 return jsonb_build_object('applied',applied);
end;
$$;
revoke all on function public.apply_document_definition_service(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.apply_document_definition_service(uuid,uuid,uuid,integer,text,text) to service_role;
