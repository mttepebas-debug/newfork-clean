-- Automated target reconciliation has no human actor. Preserve that distinction.
alter table public.onboarding_events alter column actor_user_id drop not null;
alter table public.onboarding_events add constraint document_system_event_actor
 check(actor_user_id is not null or (action like 'document.%' and metadata->>'actor_kind'='system'));
create or replace function app_private.document_audit(r public.employee_onboarding_requirements,actor uuid,event_action text,event_metadata jsonb)
returns void language sql security definer set search_path='' as $$
 insert into public.onboarding_events(workspace_id,employee_id,case_id,actor_user_id,action,target_type,target_id,metadata)
 values(r.workspace_id,r.employee_id,r.case_id,actor,event_action,'onboarding_requirement',r.id::text,
  event_metadata || case when actor is null then '{"actor_kind":"system"}'::jsonb else '{}'::jsonb end);
$$;
create function app_private.document_reconcile_employee(w uuid,e uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.employee_profiles%rowtype; m public.workspace_memberships%rowtype; r public.employee_onboarding_requirements%rowtype;
 d public.document_types%rowtype; c uuid; matching boolean; valid_approved boolean; next_deadline timestamptz; changed boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,52001));
 select * into p from public.employee_profiles where id=e and workspace_id=w;
 select * into m from public.workspace_memberships where workspace_id=w and user_id=p.user_id;
 if p.id is null or p.user_id is null then return; end if;
 -- Lock order follows document commands: case, then requirements.
 perform 1 from public.employee_onboarding_cases where workspace_id=w and employee_id=e for update;
 for r in select * from public.employee_onboarding_requirements where workspace_id=w and employee_id=e and kind='document' order by id for update loop
  if r.lifecycle_exempt then continue; end if;
  matching:=p.archived_at is null and m.status in ('active','pending_activation')
   and exists(select 1 from public.document_types where id=r.source_id and workspace_id=w and archived_at is null)
   and app_private.document_target_matches(w,e,r.lifecycle_settings->'target');
  -- Source-less historical requirements retain their explicit assignment.
  if r.source_id is null then continue; end if;
  if not matching and r.lifecycle_closed_at is null then
   update public.employee_onboarding_requirements set lifecycle_closed_at=now(),lifecycle_close_reason='Employee no longer matches the assignment',
    deadline_at=null,paused_remaining_seconds=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id;
   changed:=true; perform app_private.document_audit(r,null,'document.assignment_removed',jsonb_build_object('reason','target_changed','revision',r.lifecycle_revision+1));
  elsif matching and (r.lifecycle_closed_at is not null or r.status='superseded') then
   r.lifecycle_closed_at:=null; if r.status='superseded' then r.status:='not_started'; end if;
   valid_approved:=app_private.document_obligation_state(r,now())='completed';
   next_deadline:=case when not valid_approved and m.status='active' and r.lifecycle_settings->>'mode'<>'optional' and r.lifecycle_settings->>'period_days' is not null
    then now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours' end;
   update public.employee_onboarding_requirements set lifecycle_closed_at=null,lifecycle_close_reason=null,
    status=case when valid_approved then 'completed'::public.employee_onboarding_requirement_status when status='superseded' then 'not_started'::public.employee_onboarding_requirement_status else status end,
    deadline_at=next_deadline,paused_remaining_seconds=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id;
   changed:=true; perform app_private.document_audit(r,null,'document.assignment_reopened',jsonb_build_object('revision',r.lifecycle_revision+1,'deadline',next_deadline,'valid_approved',valid_approved));
  end if;
 end loop;
 if p.archived_at is not null or m.id is null or m.status not in ('active','pending_activation') then return; end if;
 for d in select * from public.document_types dt where dt.workspace_id=w and dt.archived_at is null
  and (m.status='pending_activation' or dt.lifecycle_settings->>'assignment_scope'='all_active')
  and app_private.document_target_matches(w,e,dt.lifecycle_settings->'target')
  and not exists(select 1 from public.employee_onboarding_requirements q where q.workspace_id=w and q.employee_id=e and q.kind='document' and q.source_id=dt.id) order by dt.id loop
  insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id,status,approved_at,approved_by)
  values(w,e,m.id,case when m.status='active' then 'approved'::public.employee_onboarding_case_status else 'in_progress'::public.employee_onboarding_case_status end,
   case when m.status='active' then now() end,case when m.status='active' then p.user_id end) on conflict(employee_id) do nothing;
  select id into c from public.employee_onboarding_cases where employee_id=e and workspace_id=w for update;
  insert into public.employee_onboarding_requirements(workspace_id,employee_id,case_id,kind,source_id,title,description,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_settings)
  values(w,e,c,'document',d.id,d.title,d.description,d.lifecycle_settings->>'mode'='required',d.lifecycle_settings->>'mode'='required',d.requires_review,100+d.sort_order,app_private.document_definition_snapshot(d),d.lifecycle_settings)
  on conflict(case_id,kind,source_id) do nothing returning * into r;
  if r.id is not null then changed:=true; perform app_private.document_audit(r,null,'document.assignment_created',jsonb_build_object('definition_revision',d.lifecycle_revision)); end if;
 end loop;
 if changed then select * into r from public.employee_onboarding_requirements where workspace_id=w and employee_id=e and kind='document' order by id limit 1; if r.id is not null then perform app_private.document_sync_onboarding(r.id,null); end if; end if;
end;
$$;
revoke all on function app_private.document_reconcile_employee(uuid,uuid) from public,anon,authenticated,service_role;

-- Lock the same tenant domain used by explicit Apply before assignment writes.
create function app_private.document_assignment_lock()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.workspace_id,old.workspace_id)::text,52001));
 return coalesce(new,old);
end;
$$;
create function app_private.document_assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=coalesce(to_jsonb(new),to_jsonb(old)); employee_id uuid;
begin
 if tg_op='UPDATE' and ((tg_table_name='employee_profiles' and (to_jsonb(new)->'user_id',to_jsonb(new)->'archived_at') is not distinct from (to_jsonb(old)->'user_id',to_jsonb(old)->'archived_at'))
  or (tg_table_name='workspace_memberships' and (to_jsonb(new)->'status',to_jsonb(new)->'user_id') is not distinct from (to_jsonb(old)->'status',to_jsonb(old)->'user_id'))
  or (tg_table_name='jobs' and (to_jsonb(new)->'department_id',to_jsonb(new)->'archived_at') is not distinct from (to_jsonb(old)->'department_id',to_jsonb(old)->'archived_at'))
  or (tg_table_name='locations' and to_jsonb(new)->'archived_at' is not distinct from to_jsonb(old)->'archived_at')) then return null; end if;
 if tg_table_name in ('employee_location_assignments','employee_job_assignments') then
  perform app_private.document_reconcile_employee((row_data->>'workspace_id')::uuid,(row_data->>'employee_id')::uuid);
 elsif tg_table_name='employee_profiles' then
  perform app_private.document_reconcile_employee((row_data->>'workspace_id')::uuid,(row_data->>'id')::uuid);
 elsif tg_table_name='workspace_memberships' then
  for employee_id in select id from public.employee_profiles where workspace_id=(row_data->>'workspace_id')::uuid and user_id=(row_data->>'user_id')::uuid loop
   perform app_private.document_reconcile_employee((row_data->>'workspace_id')::uuid,employee_id);
  end loop;
 else
  for employee_id in select a.employee_id from public.employee_job_assignments a where tg_table_name='jobs' and a.job_id=(row_data->>'id')::uuid and a.ended_at is null
   union select a.employee_id from public.employee_location_assignments a where tg_table_name='locations' and a.location_id=(row_data->>'id')::uuid and a.ended_at is null loop
   perform app_private.document_reconcile_employee((row_data->>'workspace_id')::uuid,employee_id);
  end loop;
 end if;
 return null;
end;
$$;
revoke all on function app_private.document_assignment_lock() from public,anon,authenticated,service_role;
revoke all on function app_private.document_assignment_changed() from public,anon,authenticated,service_role;
do $$
declare name text; body text;
begin
 foreach name in array array['employee_location_assignments','employee_job_assignments','employee_profiles','workspace_memberships','jobs','locations'] loop
  execute format('create trigger document_assignment_lock before insert or update or delete on public.%I for each row execute function app_private.document_assignment_lock()',name);
  execute format('create constraint trigger document_assignment_changed after insert or update or delete on public.%I deferrable initially deferred for each row execute function app_private.document_assignment_changed()',name);
 end loop;
 body:=pg_get_functiondef('app_private.document_target_matches(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'from public.employee_location_assignments a where a.workspace_id=w','from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=w');
 execute body;
 body:=pg_get_functiondef('public.initialize_employee_onboarding_service(uuid,uuid)'::regprocedure);
 body:=replace(body,'and app_private.document_target_matches(employee.workspace_id','and membership.status=''pending_activation'' and app_private.document_target_matches(employee.workspace_id');
 execute body;
end;
$$;
