-- A preferred name is what people are called where they are scheduled. Most of
-- the schedule already knew that — thirty-three functions were written to
-- prefer it and only ever saw an empty string, because the column was pinned
-- there by a check constraint until 20260922110000.
--
-- These five were missed. They build a name for a screen a manager reads while
-- drafting or publishing a schedule: the draft's conflicts, the default-hours
-- preview, the publication preflight, and the availability request queue. Each
-- sat beside a surface that had already switched over, so the same person
-- appeared under two names on one screen.
--
-- Nothing here touches a document, a signature or an onboarding record. A legal
-- name is what those are for, which is the decision and not an oversight.


CREATE OR REPLACE FUNCTION public.list_schedule_draft_document_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.manage'
  ) then
    raise exception 'schedule manage access denied' using errcode = '42501';
  end if;

  select draft.week_start
  into draft_week
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with candidate_shifts as (
    select
      shift.id,
      shift.location_id,
      location.name as location_name,
      shift.employee_id,
      trim(coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name) as employee_name,
      shift.scheduled_date,
      to_char(shift.start_time, 'HH24:MI') as start_time,
      to_char(shift.end_time, 'HH24:MI') as end_time
    from public.schedule_draft_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
     and employee.archived_at is null
    where shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.employee_id is not null
      and shift.scheduled_date >= target_week_start
      and shift.scheduled_date < target_week_start + 7
  ),
  active_document_requirements as (
    select distinct on (requirement.employee_id, requirement.source_id)
      requirement.employee_id,
      requirement.id as requirement_id,
      requirement.source_id as document_type_id,
      requirement.title as document_title
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact in ('warn', 'block')
    order by requirement.employee_id, requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  latest_pending_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'awaiting_review'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  violation_rows as (
    select
      document_type.expiry_schedule_impact,
      document_type.expiry_policy_version,
      requirement.requirement_id,
      requirement.document_type_id,
      requirement.document_title,
      accepted.id as document_id,
      accepted.expiry_date,
      pending.id as pending_document_id,
      shift.id as shift_id,
      shift.location_id,
      shift.location_name,
      shift.employee_id,
      shift.employee_name,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time
    from candidate_shifts shift
    join active_document_requirements requirement
      on requirement.employee_id = shift.employee_id
    join public.document_types document_type
      on document_type.id = requirement.document_type_id
     and document_type.workspace_id = target_workspace_id
    join latest_accepted_documents accepted
      on accepted.requirement_id = requirement.requirement_id
    left join latest_pending_documents pending
      on pending.requirement_id = requirement.requirement_id
    where accepted.expiry_date is not null
      and accepted.expiry_date < shift.scheduled_date
  ),
  conflict_rows as (
    select
      jsonb_build_object(
        'employee_id', employee_id,
        'employee_name', employee_name,
        'shift_id', shift_id,
        'location_id', location_id,
        'location_name', location_name,
        'date', scheduled_date,
        'start_time', start_time,
        'end_time', end_time,
        'document_type_id', document_type_id,
        'requirement_id', requirement_id,
        'document_id', document_id,
        'document_title', document_title,
        'expiry_date', expiry_date,
        'expiry_policy_version', expiry_policy_version,
        'pending_document_id', pending_document_id,
        'review_action', case when pending_document_id is null then null else 'review_document' end,
        'severity', case
          when expiry_schedule_impact = 'block' then 'hard'
          else 'soft'
        end,
        'overrideable', expiry_schedule_impact = 'warn',
        'warning_text', case
          when expiry_schedule_impact = 'block'
            then document_title || ' is expired and blocks scheduling.'
          else document_title || ' is expired.'
        end,
        'conflict_fingerprint', 'pending'
      ) as conflict,
      concat_ws(
        '|',
        employee_id,
        shift_id,
        document_type_id,
        requirement_id,
        document_id,
        pending_document_id,
        expiry_schedule_impact,
        expiry_policy_version,
        scheduled_date,
        expiry_date
      ) as conflict_key
    from violation_rows
    order by scheduled_date, start_time, shift_id, document_type_id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
  into conflicts, fingerprint
  from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_schedule_draft_availability_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s record; a jsonb; projection jsonb; conflicts jsonb:='[]'; signatures jsonb:='[]'; fingerprint text;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.manage') then
  raise exception 'schedule manage access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.schedule_drafts d where d.workspace_id=target_workspace_id and d.id=target_draft_id and d.week_start=target_week_start and d.archived_at is null) then
  return jsonb_build_object('status','ok','conflicts',conflicts,'fingerprint','none'); end if;
 for s in select shift.*,l.name location_name,trim(coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name) employee_name,t.name shift_type_label,j.name job_name
  from public.schedule_draft_shifts shift
  join public.locations l on l.workspace_id=shift.workspace_id and l.id=shift.location_id
  join public.employee_profiles e on e.workspace_id=shift.workspace_id and e.id=shift.employee_id
  left join public.shift_types t on t.workspace_id=shift.workspace_id and t.id=shift.shift_type_id
  left join public.jobs j on j.workspace_id=shift.workspace_id and j.id=shift.job_id
  where shift.workspace_id=target_workspace_id and shift.draft_id=target_draft_id and shift.scheduled_date between target_week_start and target_week_start+6
   and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.manage',shift.location_id)
  order by shift.scheduled_date,shift.start_time,shift.id loop
  projection:=public.schedule_availability_read_projection(actor_user_id,target_workspace_id,to_jsonb(s));
  a:=nullif(projection->'availability_assessment','null');
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'assessment',a,'retained',projection->'availability_responsibility_retained'));
  if a->>'operation'<>'allowed' then
   conflicts:=conflicts||jsonb_build_array(jsonb_build_object('employee_id',s.employee_id,'employee_name',s.employee_name,'shift_id',s.id,
    'location_id',s.location_id,'location_name',s.location_name,'date',s.scheduled_date,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
    'shift_type_label',s.shift_type_label,'job_name',s.job_name,'warning_text',coalesce(a->'reasons'->0->>'message','Review employee availability.'),
    'assessment',a,'conflict_fingerprint',a->>'fingerprint'));
  end if;
 end loop;
 fingerprint:=encode(extensions.digest(signatures::text,'sha256'),'hex');
 return jsonb_build_object('status','ok','conflicts',conflicts,'fingerprint',fingerprint);
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_default_hours_service(actor uuid, w uuid, sid uuid, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; shift record; proposed jsonb; before_a jsonb; after_a jsonb;
 rows jsonb:='[]'; evidence jsonb:='[]'; row_value jsonb; peers jsonb; before_count integer; after_count integer; unknown_count integer;
 original_span tstzrange; proposed_span tstzrange; reason text; note text; can_override boolean; fingerprint text;
 ids uuid[]; starts date; ends date; changed integer:=0; blocked integer:=0;
begin
 if jsonb_typeof(command) is distinct from 'object' or jsonb_typeof(command->'shift_ids') is distinct from 'array'
  or jsonb_array_length(command->'shift_ids') not between 1 and 200 then raise exception 'Choose 1 to 200 shifts to review' using errcode='22023'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'shift_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose each shift once' using errcode='22023'; end if;
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid;
 if session.id is null or session.holder_user_id is distinct from actor then raise exception 'Edit session not found' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() or session.revision is distinct from (command->>'expected_session_revision')::integer then
  raise exception 'Schedule editing changed; reopen the review' using errcode='40001'; end if;
 starts:=(command->>'starts_on')::date; ends:=(command->>'ends_on')::date;
 if starts is null or ends is null or starts<session.week_start or ends>session.week_start+6 or ends<starts then
  raise exception 'Choose dates within this schedule week' using errcode='22023'; end if;
 if (select count(*) from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and s.scheduled_date between starts and ends and coalesce(s.pending_op_type,'')<>'delete')<>cardinality(ids) then
  raise exception 'Selected shifts changed or are outside these dates' using errcode='40001'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and not public.schedule_actor_can_manage_service(actor,w,s.location_id)) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
 for shift in select s.*,to_jsonb(s) payload,t.default_revision,t.default_start_time,t.default_end_time,t.archived_at type_archived,
  t.name type_name,l.name location_name,l.archived_at location_archived,j.archived_at job_archived,
  coalesce(nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),''),'Open shift') employee_name,
  l.timezone location_timezone from public.schedule_edit_session_shifts s
  join public.locations l on l.id=s.location_id and l.workspace_id=w
  join public.jobs j on j.id=s.job_id and j.workspace_id=w
  left join public.shift_types t on t.id=s.shift_type_id and t.workspace_id=w
  left join public.employee_profiles e on e.id=s.employee_id and e.workspace_id=w
  where s.workspace_id=w and s.session_id=sid and s.id=any(ids) order by s.scheduled_date,s.location_id,s.id loop
  reason:=null; proposed:=null; before_a:=null; after_a:=null; note:=null; can_override:=false;
  original_span:=public.lineup_shift_range(shift.scheduled_date,shift.start_time,shift.end_time,coalesce(shift.time_timezone,shift.location_timezone));
  if shift.time_basis<>'type_default' then reason:='Only saved shift-type reference hours are included; explicit and unconfirmed hours stay unchanged';
  elsif shift.type_archived is not null or shift.default_revision is null then reason:='This shift type is archived or unavailable';
  elsif shift.default_start_time is null or shift.default_end_time is null then reason:='This shift type has no current default hours';
  elsif lower(original_span)<=now() then reason:='This shift has already started';
  elsif shift.time_snapshot->>'default_revision'=shift.default_revision::text and shift.time_snapshot->>'shift_type_id'=shift.shift_type_id::text then reason:='Already uses the current defaults';
  end if;
  if reason is null then
   proposed:=public.normalize_schedule_time_source(w,shift.payload||jsonb_build_object('time_snapshot',null),shift.payload);
   proposed_span:=public.lineup_shift_range(shift.scheduled_date,(proposed->>'start_time')::time,(proposed->>'end_time')::time,proposed->>'time_timezone');
   if lower(proposed_span)<=now() then reason:='The proposed start time is already in the past'; proposed:=null; end if;
  end if;
  if proposed is not null then
   changed:=changed+1;
   can_override:=public.schedule_actor_can_manage_service(actor,w,shift.location_id);
   if shift.employee_id is not null then
    before_a:=public.availability_impact_assessment(public.assess_weekly_shift_availability(w,shift.employee_id,shift.payload))||jsonb_build_object('can_override',can_override);
    
    after_a:=public.assess_weekly_shift_availability(w,shift.employee_id,proposed);
    after_a:=public.availability_impact_assessment(after_a)||jsonb_build_object('can_override',can_override,
     'warning_policy',after_a->'warning_policy','has_availability_conflict',after_a->'has_availability_conflict',
     'override_recorded',public.schedule_availability_override(w,proposed,after_a) is not null);
 
   end if;
   select x->>'note' into note from jsonb_array_elements(coalesce(command->'overrides','[]')) x where x->>'shift_id'=shift.id::text;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve availability or approved leave before applying these hours';
   
   elsif shift.location_archived is not null or shift.job_archived is not null then reason:='The location or job is archived';
   elsif shift.employee_id is not null and public.employee_has_hard_document_schedule_conflict_service(w,shift.employee_id,shift.scheduled_date) then reason:='Employee document requirements block this assignment';
   end if;
   if after_a->>'operation'='warning_requires_override' and reason is null then
    proposed:=proposed||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,shift.employee_id,(proposed-'id'-'source_shift_id')||jsonb_build_object('_exclude_shift_id',shift.id,'session_id',sid))->>'fingerprint'); end if;
   if reason is not null then blocked:=blocked+1; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('shift_id',shift.id,'shift_revision',shift.revision,'scheduled_date',shift.scheduled_date,
   'location_id',shift.location_id,'location_name',shift.location_name,'shift_type_name',coalesce(shift.type_name,'Unnamed shift'),'employee_name',shift.employee_name,
   'before',shift.payload,'after',proposed,'before_assessment',before_a,'after_assessment',after_a,'reason',reason,'will_change',proposed is not null,'can_apply',proposed is not null and reason is null,
   'current_default_revision',shift.default_revision));
 end loop;
 -- Compare the complete proposed selection together, including overnight and
 -- cross-location commitments. Hidden peer identities never leave this helper.
 select coalesce(jsonb_agg(payload order by source,id),'[]') into peers from (
  select 'edit' source,s.id,to_jsonb(s) payload from public.schedule_edit_session_shifts s
   where s.workspace_id=w and s.session_id=sid and coalesce(s.pending_op_type,'')<>'delete'
  union all
  select 'published',p.id,to_jsonb(p)||jsonb_build_object('id',coalesce(p.source_shift_id,p.id)) from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.workspace_id=w and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between starts-2 and ends+2 and p.employee_id is not null
    and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=coalesce(p.source_shift_id,p.id))
 ) candidates;
 for row_value in select value from jsonb_array_elements(rows) loop
  before_count:=0; after_count:=0; unknown_count:=0;
  if row_value->'after'<>'null'::jsonb and row_value->'before'->>'employee_id' is not null then
   select count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and public.lineup_shift_range((peer->>'scheduled_date')::date,(peer->>'start_time')::time,(peer->>'end_time')::time,peer->>'time_timezone') &&
    public.lineup_shift_range((row_value->>'scheduled_date')::date,(row_value->'before'->>'start_time')::time,(row_value->'before'->>'end_time')::time,row_value->'before'->>'time_timezone')),
    count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and public.lineup_shift_range((coalesce(nullif(r->'after','null'),peer)->>'scheduled_date')::date,(coalesce(nullif(r->'after','null'),peer)->>'start_time')::time,(coalesce(nullif(r->'after','null'),peer)->>'end_time')::time,coalesce(nullif(r->'after','null'),peer)->>'time_timezone') &&
    public.lineup_shift_range((row_value->>'scheduled_date')::date,(row_value->'after'->>'start_time')::time,(row_value->'after'->>'end_time')::time,row_value->'after'->>'time_timezone'))
    into before_count,after_count
   from jsonb_array_elements(peers) peer left join lateral(select value r from jsonb_array_elements(rows) where value->>'shift_id'=peer->>'id') replacement on true
   where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id';
   select count(*) into unknown_count from jsonb_array_elements(peers) peer
    where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id'
     and (peer->>'scheduled_date')::date between (row_value->>'scheduled_date')::date-2 and (row_value->>'scheduled_date')::date+2
     and (coalesce(peer->>'time_basis','') not in('explicit','type_default') or peer->>'start_time' is null or peer->>'end_time' is null or peer->>'time_timezone' is null);
  end if;
  evidence:=evidence||jsonb_build_array(row_value||jsonb_build_object('before_overlap_count',before_count,'after_overlap_count',after_count,'unconfirmed_peer_count',unknown_count));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'acknowledge_reference_overlaps'-'confirm_availability','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $function$;

CREATE OR REPLACE FUNCTION public.weekly_schedule_publication_preflight(payload jsonb, actor uuid, departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  if not public.schedule_actor_can_publish_service(actor,w,s.location_id) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
  state:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  -- Always evaluate hard rules again. Retention only suppresses unchanged
  -- soft availability reminders; new business conflicts are still reviewed.
  if prior is not null and a->>'conflict_severity'<>'block' and
   not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then
   if not public.weekly_published_availability_visible(w,s.employee_id,prior->'availability_snapshot') then continue; end if;
   a:=prior->'availability_snapshot'->'assessment'; state:='accepted';
  elsif a->>'operation'='allowed' then continue;
  elsif a->>'operation'='warning_requires_override' then
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  warning:=state is not null;
  select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord);
  tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint',
   'code',case when not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then 'availability' else 'schedule_conflict' end,
   'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
   'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
   'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
   'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
   ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.availability_requests_read_service(actor uuid, w uuid, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare queue text:=coalesce(filters->>'queue','needs_review'); search text:=btrim(coalesce(filters->>'search',''));
 location_id uuid; request_id uuid; page_size integer; cursor_value jsonb; before_created timestamptz; before_id uuid; result jsonb;
begin
 if not public.schedule_actor_has_capability_service(actor,w,'employees.read') then raise exception 'Employee availability read access required' using errcode='42501'; end if;
 if jsonb_typeof(filters) is distinct from 'object' or queue not in ('needs_review','waiting_employee','history') or length(search)>100 then
  raise exception 'Choose a valid availability queue and search' using errcode='22023'; end if;
 begin
  location_id:=nullif(filters->>'location_id','')::uuid; request_id:=nullif(filters->>'request_id','')::uuid;
  page_size:=coalesce((filters->>'limit')::integer,40);
  if nullif(filters->>'cursor','') is not null then
   cursor_value:=(filters->>'cursor')::jsonb; before_created:=(cursor_value->>'created_at')::timestamptz; before_id:=(cursor_value->>'id')::uuid;
   if jsonb_typeof(cursor_value)<>'object' or before_created is null or not isfinite(before_created) or before_id is null then raise exception 'Invalid cursor'; end if;
  end if;
 exception when others then raise exception 'Invalid availability queue filter' using errcode='22023'; end;
 if page_size not between 1 and 100 then raise exception 'Choose 1 to 100 requests per page' using errcode='22023'; end if;
 if location_id is not null and (not public.schedule_actor_has_capability_service(actor,w,'employees.read',location_id)
  or not exists(select 1 from public.locations l where l.id=location_id and l.workspace_id=w)) then
  raise exception 'Availability location access denied' using errcode='42501'; end if;
 with visible as materialized (
  select r.*,e.user_id,concat_ws(' ',nullif(coalesce(nullif(e.preferred_name,''),e.first_name),''),nullif(e.last_name,'')) employee_name,e.employee_code,
   public.availability_actor_scope(actor,w,e.id,true) all_scope,
   coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name,l.id)
    from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null and public.schedule_actor_has_capability_service(actor,w,'employees.read',l.id)),'[]') locations,
   case when r.status='pending_review' or (r.capacity_notice_open and r.status in ('denied','changes_requested')) then 'needs_review'
    when r.status in ('awaiting_employee','changes_requested') then 'waiting_employee' else 'history' end request_queue
  from public.availability_requests r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id
  where r.workspace_id=w and e.archived_at is null and public.availability_actor_scope(actor,w,e.id,false)
 ), summaries as materialized (
  select v.*,jsonb_build_object('id',v.id,'employee_id',v.employee_id,'employee_name',v.employee_name,'employee_code',v.employee_code,
   'locations',v.locations,'queue',v.request_queue,'status',v.status,'kind',v.kind,'source',v.source,
   'effective_from',v.effective_from,'effective_until',v.effective_until,'timezone',v.proposal->>'timezone',
   'capacity_notice_open',v.capacity_notice_open,'is_narrowing',v.is_narrowing,'created_at',v.created_at,
   'can_review',v.all_scope and v.user_id is distinct from actor and v.author_id<>actor,
   'review_blocker',case when v.user_id=actor then 'self_review' when v.author_id=actor then 'author_review'
    when not v.all_scope then 'location_scope' else null end) summary
  from visible v
 ), filtered as materialized (
  select * from summaries s where (search='' or strpos(lower(s.employee_name||' '||s.employee_code),lower(search))>0)
   and (location_id is null or exists(select 1 from jsonb_array_elements(s.locations) l where (l->>'id')::uuid=location_id))
 ), page as materialized (
  select * from filtered f where f.request_queue=queue and (before_created is null or (f.created_at,f.id)<(before_created,before_id))
  order by f.created_at desc,f.id desc limit page_size+1
 ), displayed as materialized (select * from page order by created_at desc,id desc limit page_size)
 select jsonb_build_object('workspace_id',w,'queue',queue,
  'requests',coalesce((select jsonb_agg(summary order by created_at desc,id desc) from displayed),'[]'),
  'selected',(select summary from summaries s where s.id=request_id),
  'needs_review_count',(select count(*) from filtered where request_queue='needs_review'),
  'waiting_employee_count',(select count(*) from filtered where request_queue='waiting_employee'),
  'history_count',(select count(*) from filtered where request_queue='history'),
  'next_cursor',case when (select count(*) from page)>page_size then (select jsonb_build_object('created_at',created_at,'id',id)::text from displayed order by created_at,id limit 1) else null end,
  'locations',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name,l.id),'[]') from public.locations l
    where l.workspace_id=w and l.archived_at is null and public.schedule_actor_has_capability_service(actor,w,'employees.read',l.id))) into result;
 return result;
end $function$;

-- The conflicts list has two overloads and only the narrower one was
-- reached above. The one the filtered board actually calls is this one.
CREATE OR REPLACE FUNCTION public.list_schedule_draft_document_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date, target_location_ids uuid[], target_department_ids uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.publish'
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_location_ids, '{}'::uuid[])) requested(location_id)
    where not public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.publish',
      requested.location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct location.id order by location.id), '{}'::uuid[])
  into normalized_locations
  from public.locations location
  join unnest(coalesce(target_location_ids, '{}'::uuid[])) requested(location_id)
    on requested.location_id = location.id
  where location.workspace_id = target_workspace_id
    and location.archived_at is null;

  if cardinality(normalized_locations) = 0 then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id)
      on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;
  end if;

  select draft.week_start
  into draft_week
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with candidate_shifts as (
    select
      shift.id,
      shift.location_id,
      location.name as location_name,
      shift.employee_id,
      trim(coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name) as employee_name,
      shift.scheduled_date,
      to_char(shift.start_time, 'HH24:MI') as start_time,
      to_char(shift.end_time, 'HH24:MI') as end_time
    from public.schedule_draft_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
     and employee.archived_at is null
    where shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.employee_id is not null
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id,
        normalized_departments,
        effective_include_no_department
      )
      and shift.scheduled_date >= target_week_start
      and shift.scheduled_date < target_week_start + 7
  ),
  active_document_requirements as (
    select distinct on (requirement.employee_id, requirement.source_id)
      requirement.employee_id,
      requirement.id as requirement_id,
      requirement.source_id as document_type_id,
      requirement.title as document_title
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact in ('warn', 'block')
    order by requirement.employee_id, requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  latest_pending_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'awaiting_review'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  violation_rows as (
    select
      document_type.expiry_schedule_impact,
      document_type.expiry_policy_version,
      requirement.requirement_id,
      requirement.document_type_id,
      requirement.document_title,
      accepted.id as document_id,
      accepted.expiry_date,
      pending.id as pending_document_id,
      shift.id as shift_id,
      shift.location_id,
      shift.location_name,
      shift.employee_id,
      shift.employee_name,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time
    from candidate_shifts shift
    join active_document_requirements requirement
      on requirement.employee_id = shift.employee_id
    join public.document_types document_type
      on document_type.id = requirement.document_type_id
     and document_type.workspace_id = target_workspace_id
    join latest_accepted_documents accepted
      on accepted.requirement_id = requirement.requirement_id
    left join latest_pending_documents pending
      on pending.requirement_id = requirement.requirement_id
    where accepted.expiry_date is not null
      and accepted.expiry_date < shift.scheduled_date
  ),
  conflict_rows as (
    select
      jsonb_build_object(
        'kind', 'document_expiry',
        'employee_id', employee_id,
        'employee_name', employee_name,
        'shift_id', shift_id,
        'location_id', location_id,
        'location_name', location_name,
        'date', scheduled_date,
        'start_time', start_time,
        'end_time', end_time,
        'document_type_id', document_type_id,
        'requirement_id', requirement_id,
        'document_id', document_id,
        'document_title', document_title,
        'expiry_date', expiry_date,
        'expiry_policy_version', expiry_policy_version,
        'pending_document_id', pending_document_id,
        'review_action', case when pending_document_id is null then null else 'review_document' end,
        'severity', case
          when expiry_schedule_impact = 'block' then 'hard'
          else 'soft'
        end,
        'overrideable', expiry_schedule_impact = 'warn',
        'warning_text', case
          when expiry_schedule_impact = 'block'
            then document_title || ' is expired and blocks scheduling.'
          else document_title || ' is expired.'
        end,
        'conflict_fingerprint', 'pending'
      ) as conflict,
      concat_ws(
        '|',
        employee_id,
        shift_id,
        document_type_id,
        requirement_id,
        document_id,
        pending_document_id,
        expiry_schedule_impact,
        expiry_policy_version,
        scheduled_date,
        expiry_date
      ) as conflict_key
    from violation_rows
    order by scheduled_date, start_time, shift_id, document_type_id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
  into conflicts, fingerprint
  from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$function$;
