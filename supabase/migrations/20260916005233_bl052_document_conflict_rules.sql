-- Extend the existing central policy, its revision trigger, fingerprint and
-- publication revalidation. No parallel document severity evaluator is added.
alter table public.workspace_scheduling_settings drop constraint scheduling_conflict_rules_valid;
update public.workspace_scheduling_settings s set conflict_rules=s.conflict_rules||jsonb_build_object(
 'document_required','confirm',
 'document_conditional_grace','warn','document_conditional_overdue','confirm');
alter table public.workspace_scheduling_settings alter column conflict_rules set default '{"availability":"confirm","approved_time_off":"block","closed_location":"confirm","minimum_travel":"confirm","minimum_rest":"confirm","document_required":"confirm","document_conditional_grace":"warn","document_conditional_overdue":"confirm"}';
alter table public.workspace_scheduling_settings add constraint scheduling_conflict_rules_valid check (
 jsonb_typeof(conflict_rules)='object'
 and conflict_rules ?& array['availability','approved_time_off','closed_location','minimum_travel','minimum_rest','document_required','document_conditional_grace','document_conditional_overdue']
 and conflict_rules-array['availability','approved_time_off','closed_location','minimum_travel','minimum_rest','document_required','document_conditional_grace','document_conditional_overdue']='{}'
 and conflict_rules->>'availability' in ('allow','warn','confirm','block') and conflict_rules->>'approved_time_off' in ('confirm','block')
 and conflict_rules->>'closed_location' in ('warn','confirm','block') and conflict_rules->>'minimum_travel' in ('warn','confirm','block')
 and conflict_rules->>'minimum_rest' in ('warn','confirm','block') and conflict_rules->>'document_required' in ('warn','confirm','block')
 and conflict_rules->>'document_conditional_grace' in ('warn','confirm','block') and conflict_rules->>'document_conditional_overdue' in ('confirm','block')
 and array_position(array['warn','confirm','block'],conflict_rules->>'document_conditional_overdue') >= array_position(array['warn','confirm','block'],conflict_rules->>'document_conditional_grace')
);
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.sync_schedule_conflict_rules()'::regprocedure);
 body:=replace(body,'begin', $patch$begin
  new.conflict_rules:=jsonb_build_object('document_required','confirm','document_conditional_grace','warn','document_conditional_overdue','confirm')
   ||case when tg_op='UPDATE' then old.conflict_rules else '{}'::jsonb end||new.conflict_rules;
 $patch$);
 execute body;
end;
$$;
-- Preserve the retired per-definition choice as audit evidence before retiring
-- the old expiry adapter's input. It must not duplicate canonical conflicts.
select app_private.record_security_audit_event_service(null,workspace_id,'document.legacy_severity_migrated','document_lifecycle_migration','document_type',id::text,
 jsonb_build_object('actor_kind','system','legacy_expiry_schedule_impact',expiry_schedule_impact,'central_rule','document_required'))
from public.document_types where expiry_schedule_impact<>'track_only';
update public.document_types set expiry_schedule_impact='track_only' where expiry_schedule_impact<>'track_only';

create function app_private.document_shift_reasons(w uuid,e uuid,shift_day date,shift_start timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; approved public.employee_document_submissions%rowtype;
 submitted public.employee_document_submissions%rowtype; code text; result jsonb:='[]'; state text;
begin
 for r in select * from public.employee_onboarding_requirements where workspace_id=w and employee_id=e and kind='document'
  and lifecycle_settings->>'mode'<>'optional' and not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded' order by id loop
  select * into approved from public.employee_document_submissions where id=r.approved_document_id;
  if approved.id is not null and (approved.expiry_date is null or approved.expiry_date>=shift_day) then continue; end if;
  select * into submitted from public.employee_document_submissions where id=r.submitted_document_id;
  state:=case when submitted.state='pending_review' then 'pending_review' when submitted.state='rejected' then 'rejected' when approved.id is not null then 'expired' else 'missing' end;
  code:=case when r.lifecycle_settings->>'mode'='required' then 'document_required'
   when r.document_suspended_at is null and ((submitted.state='pending_review' and coalesce(r.paused_remaining_seconds,0)>0) or r.deadline_at>shift_start) then 'document_conditional_grace'
   else 'document_conditional_overdue' end;
  result:=result||jsonb_build_array(jsonb_build_object('code',code,'definite',true,
   'message',format('%s: %s.',r.title,replace(state,'_',' ')),'requirement_id',r.id,'document_status',state,'expiry_date',approved.expiry_date,'deadline_at',r.deadline_at));
 end loop;
 return result;
end;
$$;
revoke all on function app_private.document_shift_reasons(uuid,uuid,date,timestamptz) from public,anon,authenticated,service_role;
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.assess_weekly_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 if strpos(body,'conflict_severity:=''allow'';')=0 or strpos(body,'when ''minimum_rest'' then settings.conflict_rules->>''minimum_rest''')=0 then raise exception 'canonical conflict anchors changed'; end if;
 body:=replace(body,'conflict_severity:=''allow'';', 'reasons:=reasons||app_private.document_shift_reasons(w,emp,day,coalesce(start_at,lower(day_span))); conflict_severity:=''allow'';');
 body:=replace(body,'when ''minimum_rest'' then settings.conflict_rules->>''minimum_rest''',
  'when ''minimum_rest'' then settings.conflict_rules->>''minimum_rest'' when ''document_required'' then settings.conflict_rules->>''document_required'' when ''document_conditional_grace'' then settings.conflict_rules->>''document_conditional_grace'' when ''document_conditional_overdue'' then settings.conflict_rules->>''document_conditional_overdue''');
 execute body;
end;
$$;
