-- Definition changes only affect future assignments. Existing snapshots/timers
-- are deliberately unchanged; the separate explicit Apply path owns those.
create function public.save_document_type_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,document_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare settings jsonb:=document_payload->'lifecycle_settings'; saved_id uuid; actual_revision integer; period integer;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 if settings is null or settings->>'mode' is null or settings->>'mode' not in ('optional','required','conditional')
  or settings->>'assignment_scope' is null or settings->>'assignment_scope' not in ('future_onboarding','all_active')
  or jsonb_typeof(settings->'target') is distinct from 'object'
 then raise exception 'valid document lifecycle settings required' using errcode='22023'; end if;
 period:=(settings->>'period_days')::integer;
 if (period is not null and period not between 1 and 3650)
  or (settings->>'mode'='conditional' and period is null)
  or (coalesce((settings->>'suspend_on_overdue')::boolean,false) and (settings->>'mode'='optional' or period is null))
 then raise exception 'valid document period required' using errcode='22023'; end if;
 if target_document_type_id is not null then
  select lifecycle_revision into actual_revision from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
  if actual_revision is null then raise exception 'document type unavailable' using errcode='P0002'; end if;
  if actual_revision is distinct from expected_revision then raise exception 'document type changed; refresh required' using errcode='PT409'; end if;
 end if;
 saved_id:=public.save_document_type_service(actor_user_id,target_workspace_id,target_document_type_id,
  document_payload->>'title',coalesce(document_payload->>'description',''),settings->>'mode'='required',
  (document_payload->>'requires_review')::boolean,array(select jsonb_array_elements_text(document_payload->'accepted_formats')),
  (document_payload->>'tracks_expiry')::boolean,(document_payload->>'expiry_warning_days')::integer,'track_only');
 update public.document_types set lifecycle_settings=settings,lifecycle_revision=case when target_document_type_id is null then 1 else lifecycle_revision+1 end where id=saved_id;
 return saved_id;
end;
$$;
revoke all on function public.save_document_type_lifecycle_service(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_document_type_lifecycle_service(uuid,uuid,uuid,integer,jsonb) to service_role;

create function app_private.snapshot_document_lifecycle_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
declare membership_state public.membership_status;
begin
 if new.kind not in ('document','acknowledgement') then return new; end if;
 select e.user_id,m.status into new.lifecycle_user_id,membership_state from public.employee_profiles e
 join public.employee_onboarding_cases c on c.id=new.case_id and c.workspace_id=new.workspace_id
 join public.workspace_memberships m on m.id=c.membership_id and m.user_id=e.user_id
 where e.id=new.employee_id and e.workspace_id=new.workspace_id;
 if new.lifecycle_settings is null and new.kind='document' then
  select lifecycle_settings into new.lifecycle_settings from public.document_types where id=new.source_id and workspace_id=new.workspace_id;
 end if;
 if new.lifecycle_settings is null then
  new.lifecycle_settings:=jsonb_build_object('mode',case when new.required then 'required' else 'optional' end,
   'target',jsonb_build_object('operator','and','location_ids','[]'::jsonb,'department_ids','[]'::jsonb,'job_ids','[]'::jsonb,'employee_ids','[]'::jsonb),
   'assignment_scope','future_onboarding','period_days',null,'suspend_on_overdue',false,'extra_fields','[]'::jsonb);
 end if;
 if new.kind='document' then new.required:=new.lifecycle_settings->>'mode'='required'; new.blocks_activation:=new.required; end if;
 if membership_state='active' and new.lifecycle_settings->>'mode'<>'optional' and new.lifecycle_settings->>'period_days' is not null then
  new.deadline_at:=now()+(new.lifecycle_settings->>'period_days')::integer*interval '24 hours';
 end if;
 return new;
end;
$$;
revoke all on function app_private.snapshot_document_lifecycle_requirement() from public,anon,authenticated;
create trigger snapshot_document_lifecycle_requirement before insert on public.employee_onboarding_requirements
for each row execute function app_private.snapshot_document_lifecycle_requirement();

create function app_private.start_document_activation_periods()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and old.status='pending_activation' then
  update public.employee_onboarding_requirements r set deadline_at=now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours'
  from public.employee_onboarding_cases c where c.id=r.case_id and c.membership_id=new.id and c.workspace_id=new.workspace_id
  and r.lifecycle_settings->>'mode'='conditional' and r.lifecycle_settings->>'period_days' is not null
  and r.deadline_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and r.status<>'completed';
 end if;
 return new;
end;
$$;
revoke all on function app_private.start_document_activation_periods() from public,anon,authenticated;
create trigger start_document_activation_periods after update of status on public.workspace_memberships
for each row execute function app_private.start_document_activation_periods();
