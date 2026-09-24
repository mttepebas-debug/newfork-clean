begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table sa_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,'11000000-0000-4000-8000-000000000001'::uuid loc,
 '13000000-0000-4000-8000-000000000001'::uuid job,'ad910000-0000-4000-8000-000000000001'::uuid emp,
 'ad920000-0000-4000-8000-000000000001'::uuid shift,'ad930000-0000-4000-8000-000000000001'::uuid typ,
 current_date-extract(isodow from current_date)::integer+1+1400 week,
 null::uuid session,null::uuid draft,null::jsonb payload,null::jsonb preview,null::jsonb snapshot;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-993291','Schedule','Availability',actor from sa_state;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) select w,emp,loc,true,actor from sa_state;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,actor from sa_state;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time) select typ,w,'Availability Lunch','#123456','12:00','16:00' from sa_state;
update sa_state set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
update sa_state set payload=public.normalize_schedule_time_source(w,jsonb_build_object('location_id',loc,'employee_id',emp,'job_id',job,'shift_type_id',typ,
 'scheduled_date',week,'time_basis','type_default','hide_time_on_badge',true,'note',''));
create function pg_temp.sa_mutate(p jsonb,op text default 'create') returns jsonb language sql as $$
 select public.mutate_schedule_edit_shift_service(s.actor,s.w,s.session,e.revision,op,s.shift,
  (select revision from public.schedule_edit_session_shifts where session_id=s.session and id=s.shift),p,gen_random_uuid())
 from sa_state s join public.schedule_edit_sessions e on e.id=s.session;
$$;
create function pg_temp.sa_assess(p jsonb) returns jsonb language sql as $$
 select public.assess_schedule_shift_service(actor,w,p,null,session) from sa_state;
$$;
select lives_ok($$select pg_temp.sa_mutate(payload) from sa_state$$,'unknown availability can remain a repairable draft');
select is(pg_temp.sa_assess(payload)->>'operation','verification_required','missing baseline is never certified as available') from sa_state;
select lives_ok($$select pg_temp.sa_mutate(payload,'delete') from sa_state$$,'draft can be removed without baseline');
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'America/Los_Angeles',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]'::jsonb)) from generate_series(0,6) d),'employee',actor,week from sa_state;
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from sa_state);
select is(pg_temp.sa_assess(payload)->>'operation','blocked','saved Lunch reference conflicts with unavailable 10-17 under hard policy') from sa_state;
select throws_ok($$select pg_temp.sa_mutate(payload) from sa_state$$,'23514',null,'authorized mutation cannot bypass hard availability');
select throws_ok($$insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis)
 select shift,w,session,loc,emp,job,week,'12:00','16:00','explicit' from sa_state$$,'23514',null,'direct assignment writer also enforces hard availability');
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from sa_state);
select is(pg_temp.sa_assess(payload)->>'operation','warning_requires_override','soft policy requires a scoped, reasoned decision') from sa_state;
select throws_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('conflict_override_note','Employee confirmed willingness for this shift.')) from sa_state$$,'40001',null,'a generic Add anyway note cannot replace current assessment review');
select throws_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','short')) from sa_state$$,'22023',null,'short reason cannot create a soft override');
select lives_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee confirmed willingness for this shift.')) from sa_state$$,'exact current assessment with a real reason grants one assignment');
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=s.w and shift_id=s.shift and revoked_at is null),1,'override evidence is stored once for the logical assignment') from sa_state s;
select is((select reason from public.schedule_availability_overrides where workspace_id=s.w and shift_id=s.shift and revoked_at is null),'Employee confirmed willingness for this shift.','override retains the actual manager reason') from sa_state s;
select lives_ok($$select pg_temp.sa_mutate(payload||'{"note":"Display-only update","hide_time_on_badge":false}','update') from sa_state$$,'note and badge changes preserve the accepted assignment');
select throws_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('time_basis','explicit','start_time','13:00','end_time','16:00','availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee confirmed willingness for this shift.'),'update') from sa_state$$,'40001',null,'changing hours invalidates the reviewed fingerprint');
select lives_ok($$select pg_temp.sa_mutate(payload||'{"time_basis":"explicit","start_time":"18:00","end_time":"20:00"}','update') from sa_state$$,'moving the assignment into available hours succeeds');
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=s.w and shift_id=s.shift and revoked_at is null),0,'meaningful assignment change revokes old override evidence') from sa_state s;
select throws_ok($$select pg_temp.sa_mutate(payload,'update') from sa_state$$,'40001',null,'changing back cannot revive the prior override');
select lives_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee reconfirmed the original lunch assignment.'),'update') from sa_state$$,'a new review may authorize the changed-back assignment');
update public.schedule_edit_session_shifts set employee_id=null where id=(select shift from sa_state) and session_id=(select session from sa_state);
select is((select count(*)::integer from public.schedule_availability_overrides where shift_id=s.shift and revoked_at is null),0,'a raw unassignment also revokes old override evidence') from sa_state s;
select throws_ok($$update public.schedule_edit_session_shifts set employee_id=s.emp from sa_state s where id=s.shift and session_id=s.session$$,'23514',null,'raw reassignment cannot revive the override after unassignment');
select lives_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee confirmed lunch after reassignment.'),'update') from sa_state$$,'an explicit new review restores the employee assignment');
delete from public.schedule_edit_session_shifts where id=(select shift from sa_state) and session_id=(select session from sa_state);
select is((select count(*)::integer from public.schedule_availability_overrides where shift_id=s.shift and revoked_at is null),0,'deleting the last retained assignment revokes its override') from sa_state s;
select throws_ok($$insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,hide_time_on_badge)
 select shift,w,session,loc,emp,job,typ,week,(payload->>'start_time')::time,(payload->>'end_time')::time,payload->>'time_basis',payload->'time_snapshot',payload->>'time_timezone',true from sa_state$$,'23514',null,'delete and raw insert cannot reuse a removed assignment decision');
select lives_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee reconfirmed the recreated lunch assignment.')) from sa_state$$,'recreation needs a new scoped override');
select lives_ok($$select public.bulk_delete_schedule_edit_shifts_service(actor,w,array[shift]) from sa_state$$,'authorized bulk deletion succeeds');
select is((select count(*)::integer from public.schedule_availability_overrides where shift_id=s.shift and revoked_at is null),0,'bulk deletion invalidates the affected override') from sa_state s;
select lives_ok($$select pg_temp.sa_mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sa_assess(payload)->>'fingerprint','conflict_override_note','Employee confirmed the lunch shift after bulk removal.')) from sa_state$$,'fresh review can restore a bulk-deleted assignment');
-- Automatic assignment cannot inherit another shift's override or guess missing capacity.
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis)
select 'ad940000-0000-4000-8000-000000000001',w,session,loc,null,job,week+1,'12:00','16:00','explicit' from sa_state;
select ok(not exists(select 1 from sa_state s,jsonb_array_elements(public.preview_schedule_auto_fill_service(actor,w,session)->'proposals') p,
 jsonb_array_elements(p->'candidates') c where p->>'shift_id'='ad940000-0000-4000-8000-000000000001' and c->>'employee_id'=s.emp::text),'auto-fill excludes soft capacity even when another shift has an override');
update public.schedule_edit_session_shifts set start_time='18:00',end_time='20:00' where id='ad940000-0000-4000-8000-000000000001';
select ok(exists(select 1 from sa_state s,jsonb_array_elements(public.preview_schedule_auto_fill_service(actor,w,session)->'proposals') p,
 jsonb_array_elements(p->'candidates') c where p->>'shift_id'='ad940000-0000-4000-8000-000000000001' and c->>'employee_id'=s.emp::text),'auto-fill includes confirmed physical capacity');
update sa_state set preview=public.preview_schedule_auto_fill_service(actor,w,session);
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
select 'ad950000-0000-4000-8000-000000000001',w,emp,loc,'approved',actor from sa_state;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
select w,'ad950000-0000-4000-8000-000000000001',week+1,'19:00','19:30','approved' from sa_state;
select throws_ok($$select public.apply_schedule_auto_fill_service(s.actor,s.w,s.session,e.revision,s.preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id','ad940000-0000-4000-8000-000000000001','employee_id',s.emp))) from sa_state s join public.schedule_edit_sessions e on e.id=s.session$$,'40001',null,'auto-fill apply rechecks leave added after its preview');
select throws_ok($$update public.schedule_edit_session_shifts set employee_id=s.emp from sa_state s where id='ad940000-0000-4000-8000-000000000001'$$,'23514',null,'raw auto-fill-style update cannot assign across approved partial leave');
select is(pg_temp.sa_assess(payload||jsonb_build_object('time_basis','explicit','scheduled_date',week+1,'start_time','18:00','end_time','20:00'))->>'coverage','partial','partial leave retains exact available pieces') from sa_state;
update public.schedule_time_off_requests set status='pending',revision=revision+1 where id='ad950000-0000-4000-8000-000000000001';
select is(pg_temp.sa_assess(payload||jsonb_build_object('time_basis','explicit','scheduled_date',week+1,'start_time','18:00','end_time','20:00'))->>'operation','allowed','a pending leave request does not release or block an assignment') from sa_state;
update sa_state set preview=public.preview_schedule_auto_fill_service(actor,w,session);
select lives_ok($$select public.apply_schedule_auto_fill_service(s.actor,s.w,s.session,e.revision,s.preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id','ad940000-0000-4000-8000-000000000001','employee_id',s.emp))) from sa_state s join public.schedule_edit_sessions e on e.id=s.session$$,'auto-fill applies a freshly eligible candidate');
select is((select employee_id from public.schedule_edit_session_shifts where id='ad940000-0000-4000-8000-000000000001'),emp,'auto-fill writes the verified assignment') from sa_state;
delete from public.schedule_edit_session_shifts where id='ad940000-0000-4000-8000-000000000001';
select throws_ok($$select public.assess_schedule_shift_service(gen_random_uuid(),w,payload) from sa_state$$,'42501',null,'unknown actor cannot read employee capacity');
select throws_ok($$select public.assess_schedule_shift_service(actor,'7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',payload) from sa_state$$,'42501',null,'assessment rejects a foreign tenant');
select throws_ok($$update public.schedule_availability_overrides set reason='Rewrite history with a different explanation' where workspace_id=(select w from sa_state)$$,'23514',null,'recorded override evidence cannot be rewritten');
update sa_state s set draft=(public.save_schedule_edit_session_service(actor,w,session,e.revision,'Availability enforcement fixture',null,null)->>'id')::uuid
from public.schedule_edit_sessions e where e.id=s.session;
select is(public.preview_schedule_publication_service(actor,w,draft,array[loc])->>'status','publish_ready','saving a draft retains the exact active assignment override') from sa_state;
update sa_state set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from sa_state);
select is(public.preview_schedule_publication_service(actor,w,draft,array[loc])->>'status','hard_blocked','changing policy invalidates draft override at publication') from sa_state;
select throws_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint','[]') from sa_state s join public.schedule_drafts d on d.id=s.draft$$,'PT409',null,'stale preflight cannot publish after policy changes');
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from sa_state);
update sa_state set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select is(preview->>'status','override_required','returning policy to soft still requires a new decision') from sa_state;
select is(preview->'findings'->0->>'code','availability','publication uses the canonical interval finding') from sa_state;
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint',
 jsonb_build_array(jsonb_build_object('finding_id',s.preview->'findings'->0->>'id','reason','Employee confirmed lunch coverage before publication.')))
 from sa_state s join public.schedule_drafts d on d.id=s.draft$$,'current scoped publication decision is enforced and recorded atomically');
update sa_state s set snapshot=(select availability_snapshot from public.schedule_published_shifts where workspace_id=s.w and source_shift_id=s.shift order by created_at desc limit 1);
select is(snapshot->>'status','assessed','new published assignment snapshots its availability evidence') from sa_state;
select is(snapshot->'assessment'->>'time_basis','type_default','publication evidence retains reference-time source') from sa_state;
select is(snapshot->'assessment'->'intervals'->0->>'start_at',to_char((week+time '12:00') at time zone 'America/Los_Angeles' at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'publication snapshots resolved physical instants') from sa_state;
select is(snapshot->'override'->>'reason','Employee confirmed lunch coverage before publication.','publication evidence includes the exact accepted decision') from sa_state;
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from sa_state);
select is(public.preview_schedule_publication_service(actor,w,draft,array[loc])->>'status','publish_ready','later policy changes do not erase an unchanged published responsibility') from sa_state;
update sa_state set preview=public.preview_schedule_unpublication_service(actor,w,week,array[loc]);
select lives_ok($$select public.unpublish_schedule_service(actor,w,week,array[loc],preview->>'fingerprint') from sa_state$$,'unpublish preserves availability publication history');
select is(public.preview_schedule_publication_service(actor,w,draft,array[loc])->>'status','publish_ready','unpublish does not force an unchanged responsibility through retroactive capacity changes') from sa_state;
update sa_state set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint','[]') from sa_state s join public.schedule_drafts d on d.id=s.draft$$,'unchanged republish carries original availability evidence');
select is((select availability_snapshot from public.schedule_published_shifts p join public.schedule_location_publications l on l.id=p.publication_id where p.workspace_id=s.w and p.source_shift_id=s.shift and l.status='current'),snapshot,'republish does not rewrite the original decision snapshot') from sa_state s;
update public.schedule_published_shifts p set employee_id=null from public.schedule_location_publications l,sa_state s where p.publication_id=l.id and p.source_shift_id=s.shift and l.status='current';
select throws_ok($$update public.schedule_published_shifts p set employee_id=s.emp from public.schedule_location_publications l,sa_state s where p.publication_id=l.id and p.source_shift_id=s.shift and l.status='current'$$,'23514',null,'in-place published reassignment cannot resurrect an older publication snapshot');
delete from public.schedule_draft_shifts where draft_id=(select draft from sa_state);
update sa_state set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint','[]') from sa_state s join public.schedule_drafts d on d.id=s.draft$$,'manager can publish removal as an explicit schedule change');
select is(public.schedule_availability_prior_publication(w,payload||jsonb_build_object('id',shift)),null::jsonb,'a superseded historical assignment is not a grandfathering bypass') from sa_state;

-- Schedule management and availability override are separate scoped grants.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('ad960000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-scoped-manager@example.test','','{}','{}',now(),now());
insert into public.workspace_roles(id,workspace_id,name,access_class)
select 'ad960000-0000-4000-8000-000000000002',w,'Availability scoped manager','manager' from sa_state;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'ad960000-0000-4000-8000-000000000002',permission from sa_state,unnest(array['workspace.read','schedule.read','schedule.manage']) permission;
insert into public.workspace_memberships(id,workspace_id,user_id,role,role_id,status,all_locations)
select 'ad960000-0000-4000-8000-000000000003',w,'ad960000-0000-4000-8000-000000000001','manager','ad960000-0000-4000-8000-000000000002','active',false from sa_state;
select tests.works_at('ad960000-0000-4000-8000-000000000003', loc) from sa_state;
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from sa_state);
select is(public.assess_schedule_shift_service('ad960000-0000-4000-8000-000000000001',w,payload)->>'can_override','false','schedule management alone does not grant availability override') from sa_state;
select throws_ok($$select public.assess_schedule_shift_service('ad960000-0000-4000-8000-000000000001',w,payload||'{"location_id":"11000000-0000-4000-8000-000000000002"}') from sa_state$$,'42501','Schedule location access denied','scoped manager cannot inspect a location outside their scope');
create temp table sa_scoped_session as select (public.acquire_schedule_edit_session_service('ad960000-0000-4000-8000-000000000001',w,week+14,'blank',null)->'session'->>'id')::uuid id from sa_state;
create function pg_temp.sa_scoped_mutation() returns jsonb language sql as $$
 select public.mutate_schedule_edit_shift_service('ad960000-0000-4000-8000-000000000001',s.w,ss.id,1,'create','ad960000-0000-4000-8000-000000000004',null,
  s.payload||jsonb_build_object('scheduled_date',s.week+14,'conflict_override_note','Employee confirmed this specific lunch exception.',
   'availability_assessment_fingerprint',public.assess_schedule_shift_service('ad960000-0000-4000-8000-000000000001',s.w,s.payload||jsonb_build_object('scheduled_date',s.week+14))->>'fingerprint'),gen_random_uuid()) from sa_state s,sa_scoped_session ss;
$$;
select throws_ok($$select pg_temp.sa_scoped_mutation()$$,'42501',null,'manager cannot bypass the separate override permission with a reason');
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'ad960000-0000-4000-8000-000000000002','schedule.availability.override' from sa_state;
select lives_ok($$select pg_temp.sa_scoped_mutation()$$,'granting scoped override permits the reviewed assignment');
select is((select actor_user_id from public.schedule_availability_overrides where shift_id='ad960000-0000-4000-8000-000000000004' and revoked_at is null),'ad960000-0000-4000-8000-000000000001'::uuid,'scoped override records the actual author');

set local role authenticated;
select throws_ok($$select * from public.schedule_availability_overrides$$,'42501',null,'employee cannot read private override evidence directly');
select throws_ok($$select public.assess_schedule_shift_service(null,null,'{}')$$,'42501',null,'assessment RPC is server-only');
reset role;
select ok(not has_function_privilege('service_role','public.schedule_prepare_availability_assignment(uuid,uuid,jsonb,jsonb)','execute'),'service cannot call internal override authorization directly');
select ok(not has_table_privilege('service_role','public.schedule_availability_overrides','insert'),'service cannot forge raw override rows');
select * from finish();
rollback;
