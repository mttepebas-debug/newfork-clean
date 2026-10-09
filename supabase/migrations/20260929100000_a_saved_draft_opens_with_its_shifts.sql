-- A saved draft opened from New Schedule showed an empty grid: the weekly
-- shift read dropped conflict_severity from each shift's availability
-- assessment, the shared contract requires it (FOUNDATION-B 5.5c), and the
-- API refused its own answer with a 500. The read now keeps the severity.
CREATE OR REPLACE FUNCTION public.schedule_availability_read_projection(actor uuid, w uuid, s jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior jsonb; a jsonb; today jsonb; evidence jsonb; retained boolean:=false; can_manage boolean;
begin
 can_manage:=app_private.authz_reason(actor,w,'schedule.edit',array[(s->>'location_id')::uuid]) is null
  or app_private.authz_reason(actor,w,'schedule.publish',array[(s->>'location_id')::uuid]) is null;
 if s->>'employee_id' is not null and can_manage then
  prior:=case when s->>'publication_id' is not null then s else public.schedule_availability_prior_publication(w,s) end;
  retained:=prior is not null;
  today:=public.assess_weekly_shift_availability(w,(s->>'employee_id')::uuid,s);
  -- An unchanged published shift keeps what was accepted when it went out
  -- (BL-174); availability is not an acceptance and is always today's (BL-186).
  if retained then
   a:=nullif(prior->'availability_snapshot'->'assessment','null');
   if a is not null then
    a:=a||jsonb_build_object('operation','allowed','responsibility_retained',true);
   end if;
  else
   a:=today;
   evidence:=public.schedule_availability_override(w,s,a);
   if a->>'operation'='warning_requires_override' and evidence is not null then
    a:=a||jsonb_build_object('operation','allowed','override_recorded',true);
   end if;
  end if;
  if a is not null and a->>'operation'='allowed' then
   a:=a||jsonb_build_object('has_availability_conflict',today->'has_availability_conflict','availability_fingerprint',today->'availability_fingerprint',
    'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(today->'reasons') r where r->>'code'='availability'));
  end if;
 end if;
 if a is not null then
  select jsonb_object_agg(key,value) into a from jsonb_each(a) where key=any(array[
   'conflict_severity','coverage','operation','time_basis','timezone','assessment_scope','intervals','available_intervals','unavailable_intervals','unknown_intervals',
   'reasons','fingerprint','policy_revision','fold_resolution','assessment_minutes','responsibility_retained','override_recorded',
   'warning_policy','has_availability_conflict','availability_fingerprint','preference_timezone']);
  a:=a||jsonb_build_object('can_override',can_manage);
 end if;
 return jsonb_build_object('availability_assessment',a,'availability_responsibility_retained',retained,
  'time_basis',s->'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->'time_timezone',
  'hide_time_on_badge',coalesce((s->>'hide_time_on_badge')::boolean,false));
end; $function$

;
