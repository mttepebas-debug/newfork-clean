-- Read-only preflight for a trusted database role. Contains no migration writes.
-- IDs are evidence links, not newly assigned case/application IDs. Preserve this
-- report with the rollout review; no disposition authorizes an owner restore.
with evidence as (
 select r.workspace_id,r.id request_id,r.request_type,r.status,r.revision,
  r.participant_response,r.created_by,r.created_at,r.updated_at,
  r.offered_shift_id,r.requested_shift_id,
  r.expected_offered_employee_id,r.expected_requested_employee_id,
  s.id resolved_offered_id,t.id resolved_requested_id,
  s.employee_id current_employee_id,t.employee_id current_requested_employee_id,
  coalesce(s.source_shift_id,s.id) offered_source_id,
  coalesce(t.source_shift_id,t.id) requested_source_id,
  p.status offered_publication_status,q.status requested_publication_status,
  coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'employee_id',x.employee_id,
   'role',x.participant_role,'created_at',x.created_at) order by x.participant_role)
   from public.schedule_shift_change_participants x
   where x.workspace_id=r.workspace_id and x.request_id=r.id),'[]'::jsonb) participants,
  (select x.employee_id from public.schedule_shift_change_participants x
   where x.workspace_id=r.workspace_id and x.request_id=r.id and x.participant_role='receiver') receiver_id,
  coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,
   'actor_user_id',e.actor_user_id,'created_at',e.created_at) order by e.created_at,e.id)
   from public.schedule_shift_change_events e
   where e.workspace_id=r.workspace_id and e.request_id=r.id),'[]'::jsonb) events,
  coalesce((select jsonb_agg(c.id order by c.id) from public.shift_exchange_cases c
   where c.workspace_id=r.workspace_id and c.status='open'
   and (c.offered_source_id in(coalesce(s.source_shift_id,s.id),coalesce(t.source_shift_id,t.id))
     or c.requested_source_id in(coalesce(s.source_shift_id,s.id),coalesce(t.source_shift_id,t.id)))),
   '[]'::jsonb) overlapping_case_ids
 from public.schedule_shift_change_requests r
 left join public.schedule_published_shifts s on s.id=r.offered_shift_id and s.workspace_id=r.workspace_id
 left join public.schedule_published_shifts t on t.id=r.requested_shift_id and t.workspace_id=r.workspace_id
 left join public.schedule_location_publications p on p.id=s.publication_id and p.workspace_id=r.workspace_id
 left join public.schedule_location_publications q on q.id=t.publication_id and q.workspace_id=r.workspace_id
), mapped as (
 select evidence.*,case
  -- A missing shift must never be mistaken for a real unassigned shift.
  when resolved_offered_id is null or (request_type='direct_swap' and resolved_requested_id is null)
   then 'exception_missing_shift'
  when offered_publication_status is distinct from 'current'
   or (request_type='direct_swap' and requested_publication_status is distinct from 'current')
   then 'exception_stale_publication'
  when status='approved' and request_type='release_pickup'
   and expected_offered_employee_id is not null and current_employee_id is null
   then 'keep_open_shift_no_owner_restore'
  when status<>'pending_manager_approval' then 'retain_immutable_history'
  when jsonb_array_length(overlapping_case_ids)>0 then 'exception_overlapping_new_case'
  when current_employee_id is distinct from expected_offered_employee_id
   or (request_type='direct_swap' and current_requested_employee_id is distinct from expected_requested_employee_id)
   then 'exception_owner_changed'
  when request_type='release_pickup' and expected_offered_employee_id is not null
   then 'owner_reconsent_required_for_cover'
  when request_type='release_pickup' and expected_offered_employee_id is null and receiver_id is not null
   then 'candidate_reconsent_required_for_open_pickup'
  when request_type='direct_swap' and receiver_id=expected_requested_employee_id
   and expected_offered_employee_id is not null and expected_requested_employee_id is not null
   and expected_offered_employee_id<>expected_requested_employee_id
   and participant_response='pending' then 'peer_consent_required_for_swap'
  when request_type='direct_swap' and receiver_id=expected_requested_employee_id
   and expected_offered_employee_id is not null and expected_requested_employee_id is not null
   and expected_offered_employee_id<>expected_requested_employee_id
   and participant_response='accepted' then 'accepted_swap_scope_and_reconsent_review'
  else 'exception_consent_or_request_shape'
 end disposition from evidence
), counts as (
 select workspace_id,disposition,count(*) request_count from mapped group by workspace_id,disposition
)
select jsonb_build_object(
 'report_version',2,'observed_at',statement_timestamp(),'assignment_writes',false,
 'request_count',(select count(*) from mapped),
 'summary',coalesce((select jsonb_agg(to_jsonb(c) order by workspace_id,disposition) from counts c),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(m) order by workspace_id,request_id) from mapped m),'[]'::jsonb),
 'exception_request_ids',coalesce((select jsonb_agg(request_id order by request_id) from mapped
   where disposition like 'exception_%'),'[]'::jsonb)
);
