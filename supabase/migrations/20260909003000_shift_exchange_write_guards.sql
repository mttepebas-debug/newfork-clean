-- All public Schedule publishers join the same workspace transaction lock used
-- by Line Up and exchange decisions. Rebase unchanged ownership fields only.
create function public.shift_exchange_rebase_drafts(w uuid,s jsonb,recipient uuid) returns void
language plpgsql set search_path='' as $$
begin
 with changed as (
  update public.schedule_draft_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and d.id in((s->>'source_id')::uuid,(s->>'id')::uuid)
   and d.employee_id is not distinct from (s->>'employee_id')::uuid
   and d.location_id=(s->>'location_id')::uuid and d.job_id is not distinct from (s->>'job_id')::uuid
   and d.scheduled_date=(s->>'date')::date and d.start_time=(s->>'start_time')::time and d.end_time=(s->>'end_time')::time
  returning d.draft_id
 ) update public.schedule_drafts set revision=revision+1,updated_at=now() where id in(select draft_id from changed);
 with changed as (
  update public.schedule_edit_session_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and (d.id in((s->>'source_id')::uuid,(s->>'id')::uuid) or d.source_published_shift_id=(s->>'id')::uuid)
   and d.employee_id is not distinct from (s->>'employee_id')::uuid
   and d.location_id=(s->>'location_id')::uuid and d.job_id is not distinct from (s->>'job_id')::uuid
   and d.scheduled_date=(s->>'date')::date and d.start_time=(s->>'start_time')::time and d.end_time=(s->>'end_time')::time
   and d.pending_op_type is distinct from 'delete'
  returning d.session_id
 ) update public.schedule_edit_sessions set revision=revision+1 where id in(select session_id from changed);
end; $$;
alter function public.shift_exchange_reconcile(uuid,uuid,jsonb,uuid) rename to shift_exchange_reconcile_shared_base;
create function public.shift_exchange_reconcile(actor uuid,w uuid,s jsonb,new_employee uuid) returns void
language plpgsql set search_path='' as $$
begin
 perform public.shift_exchange_reconcile_shared_base(actor,w,s,new_employee);
 perform public.shift_exchange_rebase_drafts(w,s,new_employee);
end; $$;

create function public.shift_exchange_assert_draft(w uuid,draft uuid,locations uuid[],departments uuid[] default null,include_no_department boolean default true) returns void
language plpgsql set search_path='' as $$
declare base_created timestamptz; shift record;
begin
 select created_at into base_created from public.schedule_drafts where workspace_id=w and id=draft;
 for shift in
  select distinct p.* from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  left join public.jobs j on j.id=p.job_id
  where c.workspace_id=w and c.status='completed' and c.updated_at>base_created and p.location_id=any(locations)
   and (departments is null or j.department_id=any(departments) or (shift_exchange_assert_draft.include_no_department and j.department_id is null))
   and p.scheduled_date between (select week_start from public.schedule_drafts where id=draft) and (select week_start+6 from public.schedule_drafts where id=draft)
 loop
  if not exists(select 1 from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=draft and d.id in(shift.id,shift.source_shift_id)
   and (d.employee_id,d.location_id,d.job_id,d.scheduled_date,d.start_time,d.end_time) is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.scheduled_date,shift.start_time,shift.end_time)) then
   raise exception 'An approved shift change conflicts with this draft. Rebase the affected shift on the current published schedule before publishing.' using errcode='PT409';
  end if;
 end loop;
end; $$;

-- Preserve each existing overload and its exact defaults, while serializing the
-- complete publication transaction before its first read or row lock.
do $guard$
declare f record; args text; dept text;
begin
 for f in select p.oid,p.proargnames,pg_get_function_arguments(p.oid) declaration,pg_get_function_identity_arguments(p.oid) identity_args
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='publish_schedule_draft_service' order by p.pronargs
 loop
  select string_agg(quote_ident(n),',' order by ord) into args from unnest(f.proargnames) with ordinality q(n,ord);
  dept:=case when 'target_department_ids'=any(f.proargnames) then 'target_department_ids,include_no_department' else 'null,true' end;
  execute format('alter function public.publish_schedule_draft_service(%s) rename to publish_schedule_draft_exchange_base',f.identity_args);
  execute format('create function public.publish_schedule_draft_service(%s) returns jsonb language plpgsql security definer set search_path='''' as $body$ begin
   perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
   perform public.shift_exchange_assert_draft(target_workspace_id,target_draft_id,target_location_ids,%s);
   return public.publish_schedule_draft_exchange_base(%s);
   exception when serialization_failure then raise exception ''%%'',SQLERRM using errcode=''PT409''; end; $body$',f.declaration,dept,args);
  execute format('revoke all on function public.publish_schedule_draft_exchange_base(%s),public.publish_schedule_draft_service(%s) from public,anon,authenticated,service_role',f.identity_args,f.identity_args);
  execute format('grant execute on function public.publish_schedule_draft_service(%s) to service_role',f.identity_args);
 end loop;
end; $guard$;

create function public.shift_exchange_assert_session(w uuid,sid uuid) returns void
language plpgsql set search_path='' as $$
declare shift record; base_created timestamptz; week date;
begin
 select created_at,week_start into base_created,week from public.schedule_edit_sessions where workspace_id=w and id=sid;
 for shift in select distinct p.* from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  where c.workspace_id=w and c.status='completed' and c.updated_at>base_created and p.scheduled_date between week and week+6
  and exists(select 1 from public.schedule_edit_session_shifts scope where scope.session_id=sid and scope.location_id=p.location_id)
 loop
  if not exists(select 1 from public.schedule_edit_session_shifts d where d.session_id=sid
   and (d.id in(shift.id,shift.source_shift_id) or d.source_published_shift_id=shift.id)
   and d.pending_op_type is distinct from 'delete'
   and (d.employee_id,d.location_id,d.job_id,d.scheduled_date,d.start_time,d.end_time) is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.scheduled_date,shift.start_time,shift.end_time)) then
   raise exception 'An approved shift change conflicts with this edit session. Rebase the affected shift before saving; your other edits are preserved.' using errcode='PT409';
  end if;
 end loop;
end; $$;
do $guard$
declare f record; args text; check_sql text; original_name text;
begin
 for f in select p.oid,p.proname,p.proargnames,pg_get_function_arguments(p.oid) declaration,pg_get_function_identity_arguments(p.oid) identity_args
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('save_schedule_edit_session_service','unpublish_schedule_service')
 loop
  select string_agg(quote_ident(n),',' order by ord) into args from unnest(f.proargnames) with ordinality q(n,ord);
  original_name:=f.proname||'_exchange_base';
  check_sql:=case when f.proname='save_schedule_edit_session_service' then 'perform public.shift_exchange_assert_session(target_workspace_id,target_session_id);' else '' end;
  execute format('alter function public.%I(%s) rename to %I',f.proname,f.identity_args,original_name);
  execute format('create function public.%I(%s) returns jsonb language plpgsql security definer set search_path='''' as $body$ begin
   perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921)); %s
   return public.%I(%s); exception when serialization_failure then raise exception ''%%'',SQLERRM using errcode=''PT409''; end; $body$',f.proname,f.declaration,check_sql,original_name,args);
  execute format('revoke all on function public.%I(%s),public.%I(%s) from public,anon,authenticated,service_role',original_name,f.identity_args,f.proname,f.identity_args);
  execute format('grant execute on function public.%I(%s) to service_role',f.proname,f.identity_args);
 end loop;
end; $guard$;
revoke all on function public.shift_exchange_assert_session(uuid,uuid) from public,anon,authenticated,service_role;

-- A legacy request cannot race a new case or restore release -> empty semantics.
alter function public.submit_employee_shift_request_service(uuid,uuid,text,uuid,uuid,text) rename to submit_employee_shift_request_exchange_legacy;
create function public.submit_employee_shift_request_service(actor_user_id uuid,target_workspace_id uuid,target_action text,target_shift_id uuid,target_requested_shift_id uuid default null,target_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 if coalesce((select shift_exchanges_enabled from public.workspaces where id=target_workspace_id),false)
 or exists(select 1 from public.shift_exchange_cases c join public.schedule_published_shifts s on s.workspace_id=c.workspace_id and coalesce(s.source_shift_id,s.id) in(c.offered_source_id,c.requested_source_id)
 where c.workspace_id=target_workspace_id and s.id in(target_shift_id,target_requested_shift_id)) then
  raise exception 'Use Shift Hub to create or manage this request. The current owner remains responsible until final approval.' using errcode='PT409';
 end if;
 return public.submit_employee_shift_request_exchange_legacy(actor_user_id,target_workspace_id,target_action,target_shift_id,target_requested_shift_id,target_note);
end; $$;
alter function public.resolve_schedule_shift_change_request_service(uuid,uuid,uuid,integer,text,text) rename to resolve_schedule_shift_change_request_exchange_legacy;
create function public.resolve_schedule_shift_change_request_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid,target_expected_revision integer,target_action text,target_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 if target_action='approve' and (
 coalesce((select shift_exchanges_enabled from public.workspaces where id=target_workspace_id),false)
 or exists(select 1 from public.schedule_shift_change_requests r join public.schedule_published_shifts s on s.id in(r.offered_shift_id,r.requested_shift_id)
 join public.shift_exchange_cases c on c.workspace_id=s.workspace_id and coalesce(s.source_shift_id,s.id) in(c.offered_source_id,c.requested_source_id)
 where r.id=target_request_id and r.workspace_id=target_workspace_id)) then
  raise exception 'This earlier request needs migration or review in Shift Hub. No assignment was changed.' using errcode='PT409';
 end if;
 return public.resolve_schedule_shift_change_request_exchange_legacy(actor_user_id,target_workspace_id,target_request_id,target_expected_revision,target_action,target_note);
end; $$;

revoke all on function public.shift_exchange_rebase_drafts(uuid,jsonb,uuid),public.shift_exchange_assert_draft(uuid,uuid,uuid[],uuid[],boolean),public.shift_exchange_reconcile_shared_base(uuid,uuid,jsonb,uuid),public.shift_exchange_reconcile(uuid,uuid,jsonb,uuid),public.submit_employee_shift_request_exchange_legacy(uuid,uuid,text,uuid,uuid,text),public.resolve_schedule_shift_change_request_exchange_legacy(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.submit_employee_shift_request_service(uuid,uuid,text,uuid,uuid,text),public.resolve_schedule_shift_change_request_service(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_employee_shift_request_service(uuid,uuid,text,uuid,uuid,text),public.resolve_schedule_shift_change_request_service(uuid,uuid,uuid,integer,text,text) to service_role;
