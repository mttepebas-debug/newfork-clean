-- Explicit review of current defaults in an owned Schedule edit session.
-- Existing published rows and explicit-hour shifts are never rewritten here.
create function public.preview_schedule_default_hours_service(actor uuid,w uuid,sid uuid,command jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  coalesce(nullif(concat_ws(' ',e.first_name,e.last_name),''),'Open shift') employee_name,
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
   can_override:=public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',shift.location_id);
   if shift.employee_id is not null then
    before_a:=public.availability_impact_assessment(public.assess_shift_availability(w,shift.employee_id,shift.payload))||jsonb_build_object('can_override',can_override);
    after_a:=public.availability_impact_assessment(public.assess_shift_availability(w,shift.employee_id,proposed))||jsonb_build_object('can_override',can_override);
   end if;
   select x->>'note' into note from jsonb_array_elements(coalesce(command->'overrides','[]')) x where x->>'shift_id'=shift.id::text;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve availability or approved leave before applying these hours';
   elsif after_a->>'operation'='warning_requires_override' and (not can_override or char_length(btrim(coalesce(note,''))) not between 10 and 500) then reason:='An authorized availability override with a reason is required';
   elsif shift.location_archived is not null or shift.job_archived is not null then reason:='The location or job is archived';
   elsif shift.employee_id is not null and public.employee_has_hard_document_schedule_conflict_service(w,shift.employee_id,shift.scheduled_date) then reason:='Employee document requirements block this assignment';
   end if;
   if after_a->>'operation'='warning_requires_override' and reason is null then
    proposed:=proposed||jsonb_build_object('conflict_override_note',note,'availability_assessment_fingerprint',after_a->>'fingerprint'); end if;
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
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'acknowledge_reference_overlaps','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $$;
revoke all on function public.preview_schedule_default_hours_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.preview_schedule_default_hours_service(uuid,uuid,uuid,jsonb) to service_role;

create table public.schedule_default_hours_reviews(
 workspace_id uuid not null references public.workspaces(id),actor_id uuid not null references auth.users(id),operation_id uuid not null,
 session_id uuid not null,command jsonb not null,review jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(workspace_id,actor_id,operation_id));
alter table public.schedule_default_hours_reviews enable row level security;
revoke all on public.schedule_default_hours_reviews from public,anon,authenticated,service_role;
create function public.guard_schedule_default_hours_review() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Default-hours review evidence is immutable' using errcode='23514'; end $$;
revoke all on function public.guard_schedule_default_hours_review() from public,anon,authenticated,service_role;
create trigger immutable_schedule_default_hours_review before update or delete on public.schedule_default_hours_reviews for each row execute function public.guard_schedule_default_hours_review();

create function public.apply_schedule_default_hours_service(actor uuid,w uuid,sid uuid,command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare review jsonb; row_value jsonb; result jsonb; prior public.schedule_default_hours_reviews%rowtype; rev integer; key uuid:=(command->>'idempotency_key')::uuid;
begin
 if key is null then raise exception 'A retry key is required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 perform public.get_schedule_edit_session_service(actor,w,sid);
 select * into prior from public.schedule_default_hours_reviews where workspace_id=w and actor_id=actor and operation_id=key;
 if found then
  if prior.session_id<>sid or prior.command<>command then raise exception 'Retry key was already used for a different review' using errcode='40001'; end if;
  return prior.result;
 end if;
 -- Settings uses atomic row updates. Hold these source rows while reviewing and
 -- applying so a changed default cannot slip between the two operations.
 perform 1 from public.shift_types t where t.workspace_id=w and t.id in(select s.shift_type_id from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id in(select value::uuid from jsonb_array_elements_text(command->'shift_ids'))) order by t.id for share;
 review:=public.preview_schedule_default_hours_service(actor,w,sid,command);
 if review->>'fingerprint' is distinct from command->>'fingerprint' then raise exception 'Defaults, shifts or conflicts changed; review again' using errcode='40001'; end if;
 if (review->>'blocked_count')::integer>0 or (review->>'changed_count')::integer=0 then raise exception 'Resolve blocked shifts or choose changed defaults before applying' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(review->'shifts') x where (x->>'will_change')::boolean and ((x->>'after_overlap_count')::integer>0 or (x->>'unconfirmed_peer_count')::integer>0))
  and coalesce((command->>'acknowledge_reference_overlaps')::boolean,false)=false then raise exception 'Review and acknowledge overlapping reference hours' using errcode='23514'; end if;
 rev:=(review->>'session_revision')::integer;
 for row_value in select value from jsonb_array_elements(review->'shifts') where (value->>'can_apply')::boolean loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,rev,'update',(row_value->>'shift_id')::uuid,(row_value->>'shift_revision')::integer,row_value->'after',null);
  rev:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_default_hours_reviews(workspace_id,actor_id,operation_id,session_id,command,review,result) values(w,actor,key,sid,command,review,result);
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(w,actor,'schedule.default_hours_applied','schedule_edit_session',sid::text,
  jsonb_build_object('review_operation_id',key,'fingerprint',review->>'fingerprint','changed_count',review->'changed_count','starts_on',review->'starts_on','ends_on',review->'ends_on'));
 return result;
end $$;
revoke all on function public.apply_schedule_default_hours_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_schedule_default_hours_service(uuid,uuid,uuid,jsonb) to service_role;
