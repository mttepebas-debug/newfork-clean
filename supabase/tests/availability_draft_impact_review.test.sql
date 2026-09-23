begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table di as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,'afa40000-0000-4000-8000-000000000001'::uuid actor,
 'afa40000-0000-4000-8000-000000000002'::uuid emp,'afa40000-0000-4000-8000-000000000003'::uuid loc,
 'afa40000-0000-4000-8000-000000000004'::uuid hidden_loc,'afa40000-0000-4000-8000-000000000005'::uuid job,
 'afa40000-0000-4000-8000-000000000006'::uuid typ,'afa40000-0000-4000-8000-000000000007'::uuid hr,
 'afa40000-0000-4000-8000-000000000008'::uuid draft,'afa40000-0000-4000-8000-000000000009'::uuid session,
 null::jsonb preview,null::jsonb request,null::jsonb decision,null::jsonb snapshot,gen_random_uuid() retry_key;
select public.availability_lock_workspace(w) from di;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@impact.test','','{}','{}',now(),now() from di cross join lateral(values(actor),(hr)) u(id);
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from di;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00003', loc,w,'Impact visible UTC','UTC','1 Test St','Test','CA','94000' from di union all
select 'T00004', hidden_loc,w,'Impact hidden LA','America/Los_Angeles','2 Test St','Test','CA','94000' from di;
insert into public.jobs(id,workspace_id,name) select job,w,'Impact job' from di;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-995601','Draft impact','Employee',manager from di;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select w,emp,loc,manager from di union all select w,emp,hidden_loc,manager from di;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) select w,emp,job,manager from di;
-- Lunch used to run 12:00-16:00, which put this person on it while also on
-- the far location's 13:00 shift and the 14:00 edit -- three places at once.
-- Nobody can hold overlapping shifts any more. At 10:00-12:00 it sits beside
-- the other two instead of on top of them, and is still inside the 10:00-17:00
-- the proposal takes away, which is what this suite is looking at.
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Impact Lunch','10:00','12:00' from di;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'employee',actor,'2034-01-01' from di;
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='narrowing',availability_initial_review=false,availability_notice_days=0,availability_enforcement='hard' where workspace_id=(select w from di);
insert into public.workspace_roles(id,workspace_id,name,access_class) select 'afa41000-0000-4000-8000-000000000001',w,'Impact HR without Schedule','manager' from di;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'afa41000-0000-4000-8000-000000000001',p from di,unnest(array['workspace.read','employees.read','employees.manage'])p;
insert into public.workspace_memberships(workspace_id,user_id,role,role_id,status,all_locations)
select w,hr,'manager','afa41000-0000-4000-8000-000000000001','active',true from di;
-- A manager-class role cannot hold every location at once any more -- the
-- membership's all_locations is turned off on the way in -- so HR is given
-- both locations by name. That is what all_locations used to mean here: HR
-- reaches every location this person works at, which is what approving
-- their request requires. What stays hidden from HR is the schedule itself,
-- because the role has no schedule permission, not the LA location.
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
select di.w,m.id,l from di join public.workspace_memberships m on m.workspace_id=di.w and m.user_id=di.hr cross join lateral (values (di.loc),(di.hidden_loc)) v(l);
insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by,location_ids) select draft,w,'2035-01-15','Impact saved draft',manager,manager,array[loc,hidden_loc] from di;
insert into public.schedule_edit_sessions(id,workspace_id,week_start,source_kind,holder_user_id,location_ids) select session,w,'2035-01-15','blank',manager,array[loc,hidden_loc] from di;
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone)
select ('afa42000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,w,draft,case when n=3 then hidden_loc else loc end,emp,job,case when n=1 then typ end,'2035-01-15',
 (payload->>'start_time')::time,(payload->>'end_time')::time,payload->>'time_basis',payload->'time_snapshot',payload->>'time_timezone'
from di,generate_series(1,3)n cross join lateral(select public.normalize_schedule_time_source(w,jsonb_build_object('location_id',case when n=3 then hidden_loc else loc end,
 'shift_type_id',case when n=1 then typ end,'time_basis',case when n=1 then 'type_default' else 'explicit' end,'hide_time_on_badge',n=1,
 'start_time',case when n=2 then '09:00' else '05:00' end,'end_time',case when n=2 then '10:00' else '06:00' end)) payload) normalized;
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
select 'afa42000-0000-4000-8000-000000000004',w,session,loc,emp,job,'2035-01-15','14:00','15:00','explicit','UTC' from di;
create function pg_temp.di_command() returns jsonb language sql as $$
 select jsonb_build_object('action','submit','employee_id',emp,'expected_revision',1,'replace_version_ids','[]'::jsonb,'proposal',jsonb_build_object('timezone','UTC','effective_from','2035-01-15','effective_until','2035-01-15','kind','temporary',
  'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unavailable','windows','[]'::jsonb)) from generate_series(0,6)d),
  'date_overrides','[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"17:00","mode":"unavailable"}]'::jsonb)) from di;
$$;
create function pg_temp.di_snapshot() returns jsonb language sql as $$
 select jsonb_build_object('drafts',(select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_draft_shifts s where s.employee_id=di.emp),
  'edits',(select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_edit_session_shifts s where s.employee_id=di.emp)) from di;
$$;
update di set snapshot=pg_temp.di_snapshot(),preview=public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command());
select is((preview->>'affected_count')::integer,3,'preview includes two saved locations and an active edit') from di;
select is((preview->>'blocking_count')::integer,3,'hard dated unavailability blocks all three changed entries') from di;
select is((select count(*)::integer from jsonb_array_elements(preview->'shifts') s where s->>'source'='active_edit'),1,'active edit is identified separately') from di;
select is((select count(*)::integer from jsonb_array_elements(preview->'shifts') s where s->>'shift_id'='afa42000-0000-4000-8000-000000000002'),0,'touching unaffected saved shift is omitted') from di;
select is((select s->'after'->>'time_basis' from jsonb_array_elements(preview->'shifts') s where s->>'shift_id'='afa42000-0000-4000-8000-000000000001'),'type_default','name-only shift uses its stored default snapshot') from di;
select is((select s->'after'->'intervals'->0->>'start_at' from jsonb_array_elements(preview->'shifts') s where s->>'shift_id'='afa42000-0000-4000-8000-000000000003'),'2035-01-15T13:00:00.000000Z','other location is assessed by physical hours') from di;
select is(pg_temp.di_snapshot(),snapshot,'preview never mutates draft shifts') from di;
select is(public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command())->>'fingerprint',preview->>'fingerprint','same review state has a stable fingerprint') from di;
select throws_ok($$select public.preview_availability_draft_impact_service(actor,w,pg_temp.di_command()) from di$$,'42501',null,'employee cannot inspect unpublished drafts');
select throws_ok($$select public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command()||'{"expected_revision":0}') from di$$,'40001',null,'stale availability revision rejected');
select is((public.preview_availability_draft_impact_service(hr,w,pg_temp.di_command())->>'restricted_count')::integer,3,'HR can review the employee without exposing roster details') from di;
select is(jsonb_array_length(public.preview_availability_draft_impact_service(hr,w,pg_temp.di_command())->'shifts'),0,'hidden draft rows are omitted') from di;
select ok(position('Impact hidden LA' in public.preview_availability_draft_impact_service(hr,w,pg_temp.di_command())::text)=0,'hidden location label not leaked') from di;
update public.shift_types set default_start_time='18:00',default_end_time='20:00' where id=(select typ from di);
select is(public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command())->>'fingerprint',preview->>'fingerprint','later type-default edit cannot move saved reference hours') from di;
savepoint semantic_case;
update public.schedule_draft_shifts set start_time='18:00',end_time='20:00',time_basis='explicit',time_snapshot=null where id='afa42000-0000-4000-8000-000000000001';
update di set preview=public.preview_availability_draft_impact_service(manager,w,jsonb_set(pg_temp.di_command(),'{proposal}',jsonb_build_object('timezone','UTC','effective_from','2035-01-15','effective_until','2035-01-15','kind','temporary',
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb,'blocked_shift_type_ids',jsonb_build_array(di.typ))) from generate_series(0,6)d))));
select is((select s->'after'->>'operation' from jsonb_array_elements(preview->'shifts')s where s->>'shift_id'='afa42000-0000-4000-8000-000000000001'),'blocked','blocked Lunch still applies when explicit hours differ from Lunch defaults') from di;
select is((select s->'after'->>'operation' from jsonb_array_elements(preview->'shifts')s where s->>'shift_id'='afa42000-0000-4000-8000-000000000002'),'verification_required','unnamed shift is not silently exempted from a service restriction') from di;
rollback to semantic_case;
savepoint soft_case;
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from di);
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,2,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"00:00","end":"13:00"},{"start":"14:00","end":"24:00"}]'::jsonb)) from generate_series(0,6)d),'employee',actor,'2034-01-01' from di;
select public.schedule_prepare_availability_assignment(di.manager,di.w,to_jsonb(s)||jsonb_build_object('conflict_override_note','Employee confirmed this particular Lunch shift.',
 'availability_assessment_fingerprint',public.assess_shift_availability(di.w,di.emp,to_jsonb(s)-'id')->>'fingerprint'),null)
from di join public.schedule_draft_shifts s on s.id='afa42000-0000-4000-8000-000000000001';
update di set preview=public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command()||'{"expected_revision":2}');
select is((select s->'before'->>'operation' from jsonb_array_elements(preview->'shifts')s where s->>'shift_id'='afa42000-0000-4000-8000-000000000001'),'allowed','before state honors the exact recorded soft override') from di;
select is((select s->'after'->>'operation' from jsonb_array_elements(preview->'shifts')s where s->>'shift_id'='afa42000-0000-4000-8000-000000000001'),'warning_requires_override','proposed capacity cannot inherit an override for different unavailable hours') from di;
select is((select count(*)::integer from public.schedule_availability_overrides where employee_id=di.emp and revoked_at is null),1,'read-only preview does not revoke historical override evidence') from di;
rollback to soft_case;
savepoint invisible_candidates;
update public.schedule_drafts set archived_at=now() where id=(select draft from di);
update public.schedule_edit_sessions set expires_at=now()-interval '1 second' where id=(select session from di);
update di set preview=public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command());
select is((preview->>'affected_count')::integer,0,'archived drafts and expired edit sessions are excluded') from di;
update public.schedule_drafts set archived_at=null where id=(select draft from di);
select throws_ok($$select public.availability_command_service(manager,w,pg_temp.di_command()||jsonb_build_object('impact_fingerprint',preview->>'fingerprint'),gen_random_uuid()) from di$$,'40001',null,'a new affected draft invalidates even a zero-impact review');
rollback to invisible_candidates;
savepoint manager_submission;
update di set preview=public.preview_availability_draft_impact_service(manager,w,pg_temp.di_command());
select is(public.availability_command_service(manager,w,pg_temp.di_command()||jsonb_build_object('source','manager_proposal','impact_fingerprint',preview->>'fingerprint'),gen_random_uuid())->>'status','awaiting_employee','reviewed manager proposal still requires employee confirmation') from di;
select is((select count(*)::integer from public.availability_draft_impact_reviews where workspace_id=di.w and actor_id=di.manager),1,'manager submission records its reviewed impact') from di;
rollback to manager_submission;
select throws_ok($$select public.availability_command_service(manager,w,pg_temp.di_command(),gen_random_uuid()) from di$$,'40001',null,'manager submission requires an actual draft review');
select is((select count(*)::integer from public.availability_requests where employee_id=(select emp from di)),0,'missing review creates no request');
update di set request=public.availability_command_service(actor,w,pg_temp.di_command(),gen_random_uuid());
select is(request->>'status','pending_review','employee submits without seeing private drafts') from di;
update di set decision=jsonb_build_object('action','approve','employee_id',emp,'request_id',request->>'request_id','expected_revision',1,'expected_request_revision',1,
 'policy_revision',(select availability_policy_revision from public.workspace_scheduling_settings where workspace_id=di.w));
update di set preview=public.preview_availability_draft_impact_service(manager,w,decision);
select is((preview->>'affected_count')::integer,3,'approval preview removes only its own pending notice from the comparison') from di;
savepoint hr_approval;
select is(public.availability_command_service(hr,w,decision||jsonb_build_object('impact_fingerprint',public.preview_availability_draft_impact_service(hr,w,decision)->>'fingerprint'),gen_random_uuid())->>'status','effective','authorized HR can approve reviewed hours without gaining Schedule visibility') from di;
select is(jsonb_array_length((select reviewed_snapshot->'shifts' from public.availability_draft_impact_reviews where request_id=(di.request->>'request_id')::uuid)),0,'HR review evidence preserves redaction') from di;
rollback to hr_approval;
select throws_ok($$select public.preview_availability_draft_impact_service(manager,w,decision||'{"policy_revision":-1}') from di$$,'40001',null,'policy changes require a fresh request review');
select throws_ok($$select public.availability_command_service(manager,w,decision,gen_random_uuid()) from di$$,'40001',null,'approval cannot omit a required review');
update public.schedule_edit_session_shifts set start_time='18:00',end_time='20:00' where id='afa42000-0000-4000-8000-000000000004' and session_id=(select session from di);
select throws_ok($$select public.availability_command_service(manager,w,decision||jsonb_build_object('impact_fingerprint',preview->>'fingerprint'),gen_random_uuid()) from di$$,'40001',null,'changed active edit invalidates the old preview');
select is((select status from public.availability_requests where id=(select (request->>'request_id')::uuid from di)),'pending_review','stale preview cannot approve the request');
update di set preview=public.preview_availability_draft_impact_service(manager,w,decision),snapshot=pg_temp.di_snapshot();
select is((preview->>'affected_count')::integer,2,'fresh preview reflects the moved active edit') from di;
update di set decision=decision||jsonb_build_object('impact_fingerprint',preview->>'fingerprint');
select is(public.availability_command_service(manager,w,decision,retry_key)->>'status','effective','reviewed approval activates availability') from di;
select is(pg_temp.di_snapshot(),snapshot,'approval leaves every draft assignment unchanged') from di;
select is((select count(*)::integer from public.availability_draft_impact_reviews where request_id=(di.request->>'request_id')::uuid),1,'approval stores immutable review evidence') from di;
select is(public.availability_command_service(manager,w,decision,retry_key)->>'status','effective','idempotent approval retry returns the committed outcome') from di;
select is((select count(*)::integer from public.availability_draft_impact_reviews where request_id=(di.request->>'request_id')::uuid),1,'retry does not duplicate review evidence') from di;
select throws_ok($$delete from public.availability_draft_impact_reviews where request_id=(select (request->>'request_id')::uuid from di)$$,'23514',null,'review evidence cannot be erased');
select is((public.assess_shift_availability(w,emp,(select to_jsonb(s) from public.schedule_draft_shifts s where id='afa42000-0000-4000-8000-000000000001'))->>'operation'),'blocked','actual Schedule assessment uses the newly approved capacity') from di;
set local role authenticated;
select throws_ok($$select public.preview_availability_draft_impact_service(null,null,null)$$,'42501',null,'impact preview requires the authenticated API boundary');
select throws_ok($$select public.assess_shift_availability_context(null,null,null,false,null,null)$$,'42501',null,'proposed capacity context is private');
select throws_ok($$select * from public.availability_draft_impact_reviews$$,'42501',null,'employee cannot read private review snapshots');
reset role;
select * from finish();
rollback;
