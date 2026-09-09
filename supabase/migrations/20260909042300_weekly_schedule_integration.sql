-- Schedule-only cutover. The shared Exchange / Line Up evaluator is unchanged
-- until its voluntary-consent adapters are migrated. Do not deploy this series
-- before the remaining client and request consumers have switched together.
create or replace function public.schedule_prepare_availability_assignment(actor uuid,w uuid,s jsonb,previous jsonb) returns void
language sql security definer set search_path='' as $$
 select public.prepare_weekly_schedule_assignment(actor,w,s,previous);
$$;
create or replace function public.assess_schedule_shift_service(actor uuid,w uuid,shift jsonb,target_shift_id uuid default null,target_session_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.assess_weekly_schedule_assignment_service(actor,w,shift,target_shift_id,target_session_id);
$$;

-- Publication permission is independent of permission to edit a schedule.
do $preflight_scope$
declare body text; anchor text:='public.schedule_actor_can_manage_service(actor,w,s.location_id)';
begin
 body:=pg_get_functiondef('public.weekly_schedule_publication_preflight(jsonb,uuid,uuid[],boolean)'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Weekly preflight scope changed'; end if;
 execute replace(body,anchor,'public.schedule_actor_can_publish_service(actor,w,s.location_id)');
end; $preflight_scope$;

create or replace function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.weekly_schedule_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids),actor_user_id);
$$;
create or replace function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[],target_department_ids uuid[],include_no_department boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.weekly_schedule_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department),actor_user_id,target_department_ids,include_no_department);
$$;

-- Reuse the publication audit envelope, but never ask for or trust a written
-- availability reason. Only a new confirm finding requires an explicit choice.
create function public.weekly_publication_decisions(preview jsonb,decisions jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; f jsonb; decision jsonb;
begin
 if jsonb_typeof(coalesce(decisions,'[]')) is distinct from 'array' then
  raise exception 'publication overrides must be an array' using errcode='22023'; end if;
 select coalesce(jsonb_agg(d),'[]') into result from jsonb_array_elements(coalesce(decisions,'[]')) d
  where not exists(select 1 from jsonb_array_elements(preview->'findings') item where item->>'id'=d->>'finding_id'
   and item->>'code'='availability' and item->>'availability_state' in ('new','accepted'));
 for f in select value from jsonb_array_elements(preview->'findings') where value->>'code'='availability'
  and value->>'severity'='soft' and (value->>'overrideable')::boolean
  and value->>'availability_state' in ('new','accepted') loop
  select d into decision from jsonb_array_elements(coalesce(decisions,'[]')) d where d->>'finding_id'=f->>'id' limit 1;
  if f->>'availability_state'='new' and f->>'warning_policy'='confirm' and decision is null then
   raise exception 'Confirm the current availability conflicts before publishing' using errcode='22023'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('finding_id',f->>'id','reason',case
   when f->>'availability_state'='accepted' then 'Previously accepted availability conflict retained.'
   when f->>'warning_policy'='confirm' then 'Availability conflict confirmed by manager.'
   else 'Availability warning acknowledged (warn policy).' end));
 end loop;
 return result;
end; $$;
revoke all on function public.weekly_publication_decisions(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Preserve the existing lease, document, department, responsibility and
-- notification wrappers. Change only the two innermost publication writers.
do $publication$
declare sig regprocedure; body text; anchor text;
begin
 foreach sig in array array[
  'public.publish_schedule_draft_service_document_conflict_base(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)'::regprocedure,
  'public.publish_schedule_draft_service_label_base(uuid,uuid,uuid,uuid[],integer,text,jsonb)'::regprocedure
 ] loop
  body:=replace(pg_get_functiondef(sig),E'\r\n',E'\n');
  anchor:='  for finding in select value from jsonb_array_elements(preview->''findings'')';
  if position(anchor in body)=0 then raise exception 'Publication validation loop changed: %',sig; end if;
  -- Only insert before the first validation loop, not inside each location.
  body:=overlay(body placing E'  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);\n'||anchor from position(anchor in body) for length(anchor));
  anchor:='    if finding->>''code''=''availability'' and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,''schedule.availability.override'',(finding->>''location_id'')::uuid) then raise exception ''Availability override permission required'' using errcode=''42501''; end if;';
  if position(anchor in body)=0 then raise exception 'Publication legacy permission changed: %',sig; end if;
  execute replace(body,anchor,'');
 end loop;
end; $publication$;

-- Raw writers must still present fresh scoped acceptance, even under warn.
-- Preserve draft hydration, immutable publications and removed-assignment guards.
do $assignment_guard$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.guard_schedule_assignment_availability()'::regprocedure);
 anchor:='public.assess_shift_availability(new.workspace_id,new.employee_id,s)';
 if position(anchor in body)=0 then raise exception 'Assignment assessment changed'; end if;
 body:=replace(body,anchor,'public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s)');
 anchor:='public.schedule_actor_has_capability_service(o.actor_user_id,new.workspace_id,''schedule.availability.override'',new.location_id)';
 if position(anchor in body)=0 then raise exception 'Publication evidence scope changed'; end if;
 body:=replace(body,anchor,'public.schedule_actor_can_publish_service(o.actor_user_id,new.workspace_id,new.location_id)');
 body:=replace(body,'A current, scoped availability override with a reason is required','A current availability acceptance is required');
 execute body;
end; $assignment_guard$;

do $retained_draft$
declare body text; anchor text:='public.assess_shift_availability(';
begin
 body:=pg_get_functiondef('public.revoke_removed_assignment_availability_override()'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Retained draft acceptance check changed'; end if;
 execute replace(body,anchor,'public.assess_weekly_shift_availability(');
end; $retained_draft$;

do $autofill$
declare body text; anchor text:='public.assess_shift_availability(';
begin
 body:=pg_get_functiondef('public.preview_schedule_auto_fill_service(uuid,uuid,uuid)'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Auto-fill assessment changed'; end if;
 execute replace(body,anchor,'public.assess_weekly_shift_availability(');
end; $autofill$;

-- Default-hour batches use the same weekly assessment and one bulk confirmation.
-- Their existing overlap acknowledgment remains a separate scheduling decision.
do $default_hours$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.preview_schedule_default_hours_service(uuid,uuid,uuid,jsonb)'::regprocedure);
 anchor:='can_override:=public.schedule_actor_has_capability_service(actor,w,''schedule.availability.override'',shift.location_id);';
 if position(anchor in body)=0 then raise exception 'Default-hours permission changed'; end if;
 body:=replace(body,anchor,'can_override:=public.schedule_actor_can_manage_service(actor,w,shift.location_id);');
 body:=replace(body,'public.assess_shift_availability(','public.assess_weekly_shift_availability(');
 anchor:='after_a:=public.availability_impact_assessment(public.assess_weekly_shift_availability(w,shift.employee_id,proposed))||jsonb_build_object(''can_override'',can_override);';
 if position(anchor in body)=0 then raise exception 'Default-hours assessment changed'; end if;
 body:=replace(body,anchor,$after$
    after_a:=public.assess_weekly_shift_availability(w,shift.employee_id,proposed);
    after_a:=public.availability_impact_assessment(after_a)||jsonb_build_object('can_override',can_override,
     'warning_policy',after_a->'warning_policy','has_availability_conflict',after_a->'has_availability_conflict',
     'override_recorded',public.schedule_availability_override(w,proposed,after_a) is not null);
 $after$);
 anchor:='elsif after_a->>''operation''=''warning_requires_override'' and (not can_override or char_length(btrim(coalesce(note,''''))) not between 10 and 500) then reason:=''An authorized availability override with a reason is required'';';
 if position(anchor in body)=0 then raise exception 'Default-hours legacy reason check changed'; end if;
 body:=replace(body,anchor,'');
 anchor:='proposed:=proposed||jsonb_build_object(''conflict_override_note'',note,''availability_assessment_fingerprint'',after_a->>''fingerprint'');';
 if position(anchor in body)=0 then raise exception 'Default-hours assignment evidence changed'; end if;
  body:=replace(body,anchor,'proposed:=proposed||jsonb_build_object(''availability_assessment_fingerprint'',public.assess_weekly_shift_availability(w,shift.employee_id,proposed-''id''-''source_shift_id'')->>''fingerprint'');');
  anchor:='command-''fingerprint''-''idempotency_key''-''acknowledge_reference_overlaps''';
  if position(anchor in body)=0 then raise exception 'Default-hours fingerprint changed'; end if;
  body:=replace(body,anchor,anchor||'-''confirm_availability''');
  execute body;
 body:=pg_get_functiondef('public.apply_schedule_default_hours_service(uuid,uuid,uuid,jsonb)'::regprocedure);
 anchor:=' rev:=(review->>''session_revision'')::integer;';
 if position(anchor in body)=0 then raise exception 'Default-hours apply loop changed'; end if;
 execute replace(body,anchor,$confirm$
 if exists(select 1 from jsonb_array_elements(review->'shifts') x where (x->>'can_apply')::boolean
  and x->'after_assessment'->>'operation'='warning_requires_override'
  and x->'after_assessment'->>'warning_policy'='confirm'
  and not coalesce((x->'after_assessment'->>'override_recorded')::boolean,false))
  and not coalesce((command->>'confirm_availability')::boolean,false) then
  raise exception 'Confirm the current availability conflicts before applying defaults' using errcode='22023'; end if;
 $confirm$||anchor);
end; $default_hours$;

create or replace function public.schedule_availability_read_projection(actor uuid,w uuid,s jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prior jsonb; a jsonb; evidence jsonb; retained boolean:=false; can_manage boolean; visible boolean;
begin
 can_manage:=public.schedule_actor_can_manage_service(actor,w,(s->>'location_id')::uuid)
  or public.schedule_actor_can_publish_service(actor,w,(s->>'location_id')::uuid);
 if s->>'employee_id' is not null and can_manage then
  prior:=case when s->>'publication_id' is not null then s else public.schedule_availability_prior_publication(w,s) end;
  retained:=prior is not null;
  if retained then
   a:=nullif(prior->'availability_snapshot'->'assessment','null');
   if a is not null then
    visible:=public.weekly_published_availability_visible(w,(s->>'employee_id')::uuid,prior->'availability_snapshot');
    a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true,'has_availability_conflict',visible);
   end if;
  else
   a:=public.assess_weekly_shift_availability(w,(s->>'employee_id')::uuid,s);
   evidence:=public.schedule_availability_override(w,s,a);
   if a->>'operation'='warning_requires_override' and evidence is not null then
    a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'override_recorded',true);
   end if;
  end if;
 end if;
 if a is not null then
  select jsonb_object_agg(key,value) into a from jsonb_each(a) where key=any(array[
   'coverage','operation','time_basis','timezone','assessment_scope','intervals','available_intervals','unavailable_intervals','unknown_intervals',
   'reasons','fingerprint','policy_revision','fold_resolution','assessment_minutes','responsibility_retained','override_recorded',
   'warning_policy','has_availability_conflict','preference_timezone']);
  a:=a||jsonb_build_object('can_override',can_manage);
 end if;
 return jsonb_build_object('availability_assessment',a,'availability_responsibility_retained',retained,
  'time_basis',s->'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->'time_timezone',
  'hide_time_on_badge',coalesce((s->>'hide_time_on_badge')::boolean,false));
end; $$;

do $read_badges$
declare body text; anchor text:='if projection->''availability_assessment''->>''operation''<>''allowed'' then';
begin
 body:=pg_get_functiondef('public.schedule_availability_enrich_read(uuid,uuid,jsonb,uuid)'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Schedule warning projection changed'; end if;
 execute replace(body,anchor,'if coalesce((projection->''availability_assessment''->>''has_availability_conflict'')::boolean,false) or projection->''availability_assessment''->>''operation''<>''allowed'' then');
end; $read_badges$;
