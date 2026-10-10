begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table dhr as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,
 'afa70000-0000-4000-8000-000000000005'::uuid loc,'afa70000-0000-4000-8000-000000000006'::uuid job,
 'afa70000-0000-4000-8000-000000000007'::uuid emp,'afa70000-0000-4000-8000-000000000008'::uuid employee_actor,
 'afa70000-0000-4000-8000-000000000001'::uuid typ,'afa70000-0000-4000-8000-000000000002'::uuid named,
 'afa70000-0000-4000-8000-000000000003'::uuid explicit_shift,
 current_date-extract(isodow from current_date)::integer+1+700 week,null::uuid session,null::jsonb command,null::jsonb preview,null::jsonb result;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code) select 'T00033', loc,w,'Default review UTC','UTC','1 Test St','Test','CA','94000' from dhr;
insert into public.jobs(id,workspace_id,name) select job,w,'Default review job' from dhr;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select employee_actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','default-review-employee@example.test','','{}','{}',now(),now() from dhr;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,employee_actor,'employee','active',true from dhr;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) select emp,w,employee_actor,'E-995701','Default review','Employee',actor from dhr;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,actor from dhr;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) select w,emp,job,actor from dhr;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
select w,emp,(select jsonb_set(p,'{days}',(select jsonb_agg(d||'{"ranges":[{"start":"00:00","end":"10:00"}]}') from jsonb_array_elements(p->'days') d))
 from (select public.empty_weekly_preference('time_range') p) x),1,employee_actor from dhr;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Default hours review','12:00','16:00' from dhr;
update dhr set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.named,null,jsonb_build_object('employee_id',null,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ,'scheduled_date',d.week,'time_basis','type_default','hide_time_on_badge',true),gen_random_uuid())
 from dhr d join public.schedule_edit_sessions s on s.id=d.session;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.explicit_shift,null,jsonb_build_object('employee_id',null,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ,'scheduled_date',d.week,'time_basis','explicit','start_time','09:00','end_time','11:00'),gen_random_uuid())
 from dhr d join public.schedule_edit_sessions s on s.id=d.session;
update public.shift_types set default_start_time='11:00',default_end_time='17:00' where id=(select typ from dhr);
update dhr d set command=jsonb_build_object('expected_session_revision',s.revision,'starts_on',week,'ends_on',week+6,'shift_ids',jsonb_build_array(named,explicit_shift),'overrides','[]'::jsonb) from public.schedule_edit_sessions s where s.id=d.session;
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->>'changed_count')::integer,1,'only saved reference shifts are changed') from dhr;
select is((preview->>'blocked_count')::integer,0,'unassigned default changes need no availability override') from dhr;
select is((select x->'before'->>'start_time' from jsonb_array_elements(preview->'shifts') x where x->>'shift_id'=named::text),'12:00:00','preview retains original reference hours') from dhr;
select is((select x->'after'->>'start_time' from jsonb_array_elements(preview->'shifts') x where x->>'shift_id'=named::text),'11:00','preview resolves current reference hours') from dhr;
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'12:00:00','preview writes no shift') from dhr d;
select is((select count(*)::integer from public.schedule_default_hours_reviews where session_id=(select session from dhr)),0,'preview writes no audit review');
select throws_ok($$select public.preview_schedule_default_hours_service('afa70000-0000-4000-8000-000000000099',w,session,command) from dhr$$,'42501',null,'another user cannot preview a held session');
select throws_ok($$select public.preview_schedule_default_hours_service(actor,w,session,command||'{"expected_session_revision":0}') from dhr$$,'PT409',null,'stale session revision is rejected');
select throws_ok($$select public.preview_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('shift_ids',jsonb_build_array(named,named))) from dhr$$,'22023',null,'duplicate selections are rejected');
select throws_ok($$select public.preview_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('starts_on',week-1)) from dhr$$,'22023',null,'selection is bounded by the edit week');
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint','stale','idempotency_key',gen_random_uuid())) from dhr$$,'PT409',null,'apply requires the exact reviewed fingerprint');
update dhr set command=command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid());
update dhr set result=public.apply_schedule_default_hours_service(actor,w,session,command);
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'11:00:00','apply changes the selected reference hours') from dhr d;
select is((select time_snapshot->>'default_revision' from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'2','apply records the reviewed current revision') from dhr d;
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.explicit_shift),'09:00:00','explicit clock hours are untouched') from dhr d;
select ok((result->>'dirty')::boolean,'result remains an unsaved edit session') from dhr;
select is(public.apply_schedule_default_hours_service(actor,w,session,command),result,'identical retry returns the committed result') from dhr;
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||'{"confirm_availability":true}') from dhr$$,'PT409',null,'retry key cannot authorize different review content');
select is((select count(*)::integer from public.schedule_default_hours_reviews where session_id=(select session from dhr)),1,'one immutable review is recorded');
select throws_ok($$update public.schedule_default_hours_reviews set command='{}' where session_id=(select session from dhr)$$,'23514',null,'review evidence cannot be rewritten');
select is((select count(*)::integer from public.audit_events where action='schedule.default_hours_applied' and target_id=(select session::text from dhr)),1,'application is audited once');
update public.shift_types set default_start_time='10:00',default_end_time='18:00' where id=(select typ from dhr);
update dhr set command=(command-'idempotency_key'-'fingerprint')||jsonb_build_object('expected_session_revision',(result->>'revision')::integer);
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
update public.shift_types set default_start_time='10:30' where id=(select typ from dhr);
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from dhr$$,'PT409',null,'default edits after preview require a new review');
-- A populated selection compares occupancy and authoritative employee capacity.
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'update',d.named,x.revision,to_jsonb(x)||jsonb_build_object('employee_id',d.emp),null)
 from dhr d join public.schedule_edit_sessions s on s.id=d.session join public.schedule_edit_session_shifts x on x.session_id=d.session and x.id=d.named;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create','afa70000-0000-4000-8000-000000000009',null,jsonb_build_object('employee_id',d.emp,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ,'scheduled_date',d.week,'time_basis','explicit','start_time','17:30','end_time','19:00'),gen_random_uuid())
 from dhr d join public.schedule_edit_sessions s on s.id=d.session;
update dhr d set command=jsonb_build_object('expected_session_revision',s.revision,'starts_on',week,'ends_on',week+6,'shift_ids',jsonb_build_array(named),'overrides','[]'::jsonb) from public.schedule_edit_sessions s where s.id=d.session;
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->'shifts'->0->>'before_overlap_count')::integer,0,'old reference hours have no overlap') from dhr;
select is((preview->'shifts'->0->>'after_overlap_count')::integer,1,'new reference hours expose the overlapping peer') from dhr;
select ok(not (preview->'shifts'->0 ? 'unconfirmed_peer_count'),'every saved shift has hours, so no peer is counted as unknown') from dhr;
select is(preview->'shifts'->0->'after_assessment'->>'operation','blocked','the core blocks the new interval against the person''s other shift') from dhr;
select is((select jsonb_agg(x->>'code') from jsonb_array_elements(preview->'shifts'->0->'after_assessment'->'reasons') x where x->>'severity'='block'),'["time_overlap"]'::jsonb,'the only block is the overlap') from dhr;
-- User decision 2026-09-26 (FB-6.1.8): new default hours that overlap another shift of the same person are a hard block, never a warning to accept.
select is((preview->>'blocked_count')::integer,1,'new reference hours that overlap the same person''s other shift are blocked') from dhr;
select ok(not (preview->'shifts'->0->>'can_apply')::boolean,'an overlapping shift cannot be applied') from dhr;
select is(preview->'shifts'->0->>'reason','Overlaps Default hours review 5:30 PM–7:00 PM','the block names the shift it overlaps') from dhr;
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from dhr$$,'23514',null,'an overlap blocks apply');
select is((select end_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'17:00:00','a blocked review changes no hours') from dhr d;
-- Moving the other shift so the two only touch clears the block.
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'update',x.id,x.revision,to_jsonb(x)||jsonb_build_object('start_time','18:00'),null)
 from dhr d join public.schedule_edit_sessions s on s.id=d.session join public.schedule_edit_session_shifts x on x.session_id=d.session and x.id='afa70000-0000-4000-8000-000000000009';
update dhr d set command=command||jsonb_build_object('expected_session_revision',s.revision) from public.schedule_edit_sessions s where s.id=d.session;
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->'shifts'->0->>'after_overlap_count')::integer,0,'shifts that only touch do not overlap') from dhr;
update dhr set result=public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
select is((select end_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'18:00:00','without an overlap the new reference hours are applied') from dhr d;
select is((public.apply_schedule_default_hours_service(actor,w,session,(select r.command from public.schedule_default_hours_reviews r where r.session_id=d.session and jsonb_array_length(r.command->'shift_ids')=2))->>'revision')::integer,
 (result->>'revision')::integer,'old idempotent retry returns the current session instead of undoing later client state') from dhr d;
select is((select count(*)::integer from public.schedule_default_hours_reviews where session_id=(select session from dhr)),2,'old retry adds no review and applies no shifts again');
update public.shift_types set default_start_time='09:00' where id=(select typ from dhr);
update dhr d set command=command||jsonb_build_object('expected_session_revision',s.revision) from public.schedule_edit_sessions s where s.id=d.session;
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
-- BL-186: new hours in the person's marked time are only a warning.
select is((preview->>'blocked_count')::integer,0,'new hours in marked unavailable time are not blocked: availability is a preference') from dhr;
select is(preview->'shifts'->0->'after_assessment'->>'operation','allowed','and need no confirmation') from dhr;
select ok((preview->'shifts'->0->'after_assessment'->>'has_availability_conflict')::boolean,'the review still shows the availability warning') from dhr;
-- Require confirmation still guards the other rules: the day closes (closed_location = confirm).
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, location_days, created_by)
 select 'afa70000-0000-4000-8000-000000000020', w, loc, array[loc]::uuid[], (week)::date, (week)::date, 'Closed', 'holiday', jsonb_build_object((loc)::text, jsonb_build_object('status', 'closed')), actor from dhr;
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is(preview->'shifts'->0->'after_assessment'->>'operation','warning_requires_override','soft policy requires a fresh override') from dhr;
update dhr set command=command||jsonb_build_object('overrides',jsonb_build_array(jsonb_build_object('shift_id',named,'note','Reviewed the new service reference hours')));
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->>'blocked_count')::integer,0,'authorized reason permits reviewing the soft override') from dhr;
select tests.approved_leave(w,emp,actor,loc,week,'13:00','14:00') from dhr;
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from dhr$$,'PT409',null,'approved leave arriving after review makes the fingerprint stale');
update dhr set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->>'blocked_count')::integer,1,'approved leave stays a hard block') from dhr;
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.named),'10:30:00','rejected attempts preserve the last applied reference hours') from dhr d;
-- Published shifts are edited through a new draft session, never in place.
create temp table dhr_pub as select w,actor,loc,job,emp,week+7 week,'afa70000-0000-4000-8000-000000000010'::uuid typ,
 'afa70000-0000-4000-8000-000000000011'::uuid shift,'afa70000-0000-4000-8000-000000000012'::uuid second_shift,
 null::uuid session,null::uuid draft,null::jsonb result,null::jsonb command,null::jsonb preview from dhr;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Published default review','12:00','16:00' from dhr_pub;
update dhr_pub set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.shift,null,jsonb_build_object('employee_id',null,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ,'scheduled_date',d.week,'time_basis','type_default','hide_time_on_badge',true,'note','Keep original note','unpaid_break_minutes',15),gen_random_uuid())
 from dhr_pub d join public.schedule_edit_sessions s on s.id=d.session;
update dhr_pub d set draft=(public.save_schedule_edit_session_service(actor,w,session,s.revision,'Published default review',null,null)->>'id')::uuid from public.schedule_edit_sessions s where s.id=d.session;
update dhr_pub set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select public.publish_schedule_draft_service(d.actor,d.w,d.draft,array[d.loc],null,true,s.revision,d.preview->>'fingerprint','[]') from dhr_pub d join public.schedule_drafts s on s.id=d.draft;
update dhr_pub set session=(public.acquire_schedule_edit_session_service(actor,w,week,'published',null)->'session'->>'id')::uuid;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.second_shift,null,jsonb_build_object('employee_id',d.emp,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ,'scheduled_date',d.week+1,'time_basis','type_default','hide_time_on_badge',true),gen_random_uuid())
 from dhr_pub d join public.schedule_edit_sessions s on s.id=d.session;
update public.shift_types set default_start_time='13:00',default_end_time='17:00' where id=(select typ from dhr_pub);
update dhr_pub d set command=jsonb_build_object('expected_session_revision',s.revision,'starts_on',week,'ends_on',week+6,'shift_ids',jsonb_build_array(shift,second_shift),'overrides','[]'::jsonb) from public.schedule_edit_sessions s where s.id=d.session;
update dhr_pub set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
-- An assignment that ends after the review makes the review stale: no row of the batch is applied.
update public.employee_job_assignments set ended_at=now() where employee_id=(select emp from dhr_pub) and job_id=(select job from dhr_pub);
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from dhr_pub$$,'PT409',null,'an assignment ending after review rejects the entire batch');
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.shift),'12:00:00','no row of the rejected batch is applied') from dhr_pub d;
update public.employee_job_assignments set ended_at=null where employee_id=(select emp from dhr_pub) and job_id=(select job from dhr_pub);
update dhr_pub set result=public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
select is((select start_time::text from public.schedule_published_shifts where workspace_id=d.w and source_shift_id=d.shift),'12:00:00','published responsibility keeps its original hours until publication') from dhr_pub d;
select is((select start_time::text from public.schedule_edit_session_shifts where session_id=d.session and id=d.shift),'13:00:00','new reference hours stay in the edit session') from dhr_pub d;
select is((select pending_op_type from public.schedule_edit_session_shifts where session_id=d.session and id=d.shift),'update','published source receives a pending update') from dhr_pub d;
select is((select note from public.schedule_edit_session_shifts where session_id=d.session and id=d.shift),'Keep original note','default application preserves the existing note') from dhr_pub d;
select is((select unpaid_break_minutes from public.schedule_edit_session_shifts where session_id=d.session and id=d.shift),15,'default application preserves break metadata') from dhr_pub d;
-- Two selected shifts whose new hours overlap only each other: each is compared with the other at its proposed hours.
create temp table dhr_pair as select w,actor,loc,job,emp,week+14 week,'afa70000-0000-4000-8000-000000000014'::uuid typ_a,'afa70000-0000-4000-8000-000000000015'::uuid typ_b,
 'afa70000-0000-4000-8000-000000000016'::uuid shift_a,'afa70000-0000-4000-8000-000000000017'::uuid shift_b,null::uuid session,null::jsonb command,null::jsonb preview from dhr;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select typ_a,w,'Pair opener','11:00'::time,'12:00'::time from dhr_pair union all select typ_b,w,'Pair closer','17:00'::time,'18:00'::time from dhr_pair;
update dhr_pair set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.shift_a,null,jsonb_build_object('employee_id',d.emp,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ_a,'scheduled_date',d.week,'time_basis','type_default'),gen_random_uuid())
 from dhr_pair d join public.schedule_edit_sessions s on s.id=d.session;
select public.mutate_schedule_edit_shift_service(d.actor,d.w,d.session,s.revision,'create',d.shift_b,null,jsonb_build_object('employee_id',d.emp,'location_id',d.loc,'job_id',d.job,'shift_type_id',d.typ_b,'scheduled_date',d.week,'time_basis','type_default'),gen_random_uuid())
 from dhr_pair d join public.schedule_edit_sessions s on s.id=d.session;
update public.shift_types set default_start_time='13:00',default_end_time='15:00' where id=(select typ_a from dhr_pair);
update public.shift_types set default_start_time='14:00',default_end_time='16:00' where id=(select typ_b from dhr_pair);
update dhr_pair d set command=jsonb_build_object('expected_session_revision',s.revision,'starts_on',week,'ends_on',week+6,'shift_ids',jsonb_build_array(shift_a,shift_b),'overrides','[]'::jsonb) from public.schedule_edit_sessions s where s.id=d.session;
update dhr_pair set preview=public.preview_schedule_default_hours_service(actor,w,session,command);
select is((preview->>'blocked_count')::integer,2,'both shifts are blocked when their new hours overlap each other') from dhr_pair;
select is((select x->>'reason' from jsonb_array_elements(preview->'shifts') x where x->>'shift_id'=shift_a::text),'Overlaps Pair closer 2:00 PM–4:00 PM','the block names the other shift at its new hours') from dhr_pair;
select throws_ok($$select public.apply_schedule_default_hours_service(actor,w,session,command||jsonb_build_object('fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from dhr_pair$$,'23514',null,'apply refuses the overlapping pair');
-- EKRAN-01 B4: the review used to answer one sentence for a changed, lapsed
-- or closed edit; the screen tells them apart by the key in the hint.
create function pg_temp.refusal_hint(statement text) returns text language plpgsql as $f$
declare code text; reason text;
begin
 execute statement;
 return 'allowed';
exception when others then
 get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
 return concat_ws(' ', code, nullif(reason, ''));
end; $f$;
select is(pg_temp.refusal_hint($$select public.preview_schedule_default_hours_service(actor,w,session,command||'{"expected_session_revision":0}') from dhr_pair$$),
 'PT409 schedule.edit_session_stale','a review on an old revision names the changed edit');
update public.schedule_edit_sessions set expires_at=now()-interval '1 minute' where id=(select session from dhr_pair);
select is(pg_temp.refusal_hint($$select public.preview_schedule_default_hours_service(actor,w,session,command) from dhr_pair$$),
 'PT409 schedule.edit_lease_expired','a review after the lock ran out names the lapsed lock');
update public.schedule_edit_sessions set status='expired' where id=(select session from dhr_pair);
select is(pg_temp.refusal_hint($$select public.preview_schedule_default_hours_service(actor,w,session,command) from dhr_pair$$),
 'PT409 schedule.edit_session_closed','a review on a closed edit names the closed edit');
set local role authenticated;
select throws_ok($$select public.preview_schedule_default_hours_service(null,null,null,'{}')$$,'42501',null,'preview is service-only');
select throws_ok($$select public.apply_schedule_default_hours_service(null,null,null,'{}')$$,'42501',null,'apply is service-only');
select throws_ok($$select * from public.schedule_default_hours_reviews$$,'42501',null,'review history is not directly readable');
reset role;
select * from finish();
rollback;
