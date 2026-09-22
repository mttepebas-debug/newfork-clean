begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wp_fixture as select
 'ad410000-0000-4000-8000-000000000001'::uuid w,
 'ad410000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad410000-0000-4000-8000-000000000003'::uuid actor,
 'ad410000-0000-4000-8000-000000000004'::uuid emp,
 'ad410000-0000-4000-8000-000000000005'::uuid manager,
 'ad410000-0000-4000-8000-000000000006'::uuid loc,
 'ad410000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad410000-0000-4000-8000-000000000008'::uuid dinner,
 'ad410000-0000-4000-8000-000000000009'::uuid hidden_type,
 public.empty_weekly_preference('time_range') p;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly preferences test',owner_id from wp_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00066', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00067', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select f.w,m.id,f.loc from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;


create temp table wp_command(command jsonb,result jsonb,request_key uuid default gen_random_uuid());
insert into wp_command(command) select jsonb_build_object('employee_id',emp,'source','employee','expected_revision',0,'settings_revision',0,'preference',p) from wp_fixture;
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture$$,'explicit all-available declaration saves immediately');
select is(result->'model'->'employee'->>'submitted','true','submission recorded without approval') from wp_command;
select is(result->'model'->'employee'->>'revision','1','initial revision advanced') from wp_command;
select is((select count(*) from public.availability_requests where workspace_id=(select w from wp_fixture)),0::bigint,'old review requests not created');
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture,wp_command$$,'same-key retry succeeds');
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wp_fixture)),1::bigint,'retry does not duplicate audit');
select is((select count(*) from public.notification_outbox where workspace_id=(select w from wp_fixture) and subject_type='weekly_availability'),1::bigint,'retry does not duplicate notification');
select ok((select payload->'recipient_user_ids' @> jsonb_build_array(f.owner_id,f.manager) and not payload->'recipient_user_ids' @> jsonb_build_array(f.actor) from public.notification_outbox o,wp_fixture f where o.workspace_id=f.w and o.subject_type='weekly_availability'),'only scoped managers and owner notified');
select lives_ok($$select public.project_notification_event_service(id) from public.notification_outbox where workspace_id=(select w from wp_fixture) and subject_type='weekly_availability'$$,'weekly change event projects through the real relay');
select lives_ok($$select public.project_notification_recipients_service(id) from public.notification_outbox where workspace_id=(select w from wp_fixture) and subject_type='weekly_availability'$$,'weekly change recipients resolve through policy');
select lives_ok($$select public.project_notification_inbox_service(id) from public.notification_outbox where workspace_id=(select w from wp_fixture) and subject_type='weekly_availability'$$,'weekly change reaches inbox projection');
select is((select count(*) from public.notifications where workspace_id=(select w from wp_fixture)),2::bigint,'owner and scoped manager each receive an inbox entry');
select ok((select bool_and(action_url='/app/employees?employeeId='||(select emp::text from wp_fixture)||'&section=availability') from public.notifications where workspace_id=(select w from wp_fixture)),'final inbox link opens the exact employee availability drawer');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'PT409',null,'stale new command rejected');
select throws_ok($$select public.weekly_preferences_save_service(manager,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'42501',null,'manager cannot write employee declaration');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command||'{"confirm_clear":true}',request_key) from wp_fixture,wp_command$$,'22023',null,'reused key cannot carry a different command');
update wp_command set command=jsonb_build_object('employee_id',emp,'source','manager','expected_revision',0,'settings_revision',0,'preference',p,'enabled',true,'notes',jsonb_build_array('','Private manager note','','','','','')),request_key=gen_random_uuid() from wp_fixture;
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(manager,w,command,request_key) from wp_fixture$$,'scoped manager saves separate reminders');
select is(public.weekly_preferences_read_service(actor,w)->'manager','null'::jsonb,'employee never receives reminders') from wp_fixture;
select is((select count(*) from public.notification_outbox where workspace_id=(select w from wp_fixture) and subject_type='weekly_availability'),1::bigint,'reminder save does not notify employee');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'42501',null,'employee cannot save manager reminder');
update public.workspace_scheduling_settings set availability_input_mode='shift_type',availability_preferences_revision=1 where workspace_id=(select w from wp_fixture);
update wp_command set command=command||jsonb_build_object('expected_revision',1,'settings_revision',1,'copy_employee_revision',1),request_key=gen_random_uuid();
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(manager,w,command,request_key) from wp_fixture$$,'exact employee copy allowed across modes');
select is(result->'model'->'manager'->'preference'->>'input_mode','time_range','old mode retained without conversion') from wp_command;
select is(result->'model'->'manager'->'notes'->>1,'Private manager note','copy retains manager notes') from wp_command;
select throws_ok($$select public.weekly_preferences_save_service(manager,w,command||'{"expected_revision":2,"copy_employee_revision":99}',gen_random_uuid()) from wp_fixture,wp_command$$,'PT409',null,'stale employee copy rejected');

-- Complete pending-request scenarios use isolated upcoming request snapshots.
update public.locations set timezone='UTC' where workspace_id=(select w from wp_fixture);
update public.workspace_scheduling_settings set availability_input_mode='time_range',availability_preferences_revision=2 where workspace_id=(select w from wp_fixture);
create temp table wp_requests as select i,gen_random_uuid() cid,gen_random_uuid() aid,gen_random_uuid() source_id from generate_series(1,5) i;
insert into public.shift_exchange_cases(id,workspace_id,kind,owner_id,offered_source_id,requested_source_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,created_by)
select r.cid,f.w,case when r.i=4 then 'swap' when r.i=5 then 'cover' else 'open_pickup' end,case when r.i in(4,5) then f.emp else null end,r.source_id,
 case when r.i=4 then gen_random_uuid() else null end,
 jsonb_build_object('location_id',f.loc,'location_name','West','date','2035-01-15','start_time','09:00','end_time','17:00','time_basis','explicit','time_timezone','UTC'),
 case when r.i=4 then jsonb_build_object('location_id',f.loc,'date','2035-01-16','start_time','09:00','end_time','17:00','time_basis','explicit','time_timezone','UTC') else null end,
 'test-consent','2035-01-15 09:00Z',f.actor from wp_requests r,wp_fixture f;
insert into public.shift_exchange_applications(id,workspace_id,case_id,employee_id,status,consent_fingerprint)
 select r.aid,f.w,r.cid,f.emp,'pending_manager','test-consent' from wp_requests r,wp_fixture f where r.i in(1,2,3);
create temp table wp_offer(id uuid primary key default gen_random_uuid());
insert into wp_offer default values;
insert into public.lineup_proposals(id,workspace_id,kind,status,created_by,source_location_id,target_location_id,employee_id,operation,fingerprint,source_date,idempotency_key,expires_at)
 select o.id,f.w,'offer','accepted',f.manager,f.loc,f.loc,f.emp,
 jsonb_build_object('kind','assign','target',jsonb_build_object('date','2035-01-15','start_time','09:00','end_time','17:00')),
 'test-offer','2035-01-15',gen_random_uuid(),'2035-01-15 09:00Z' from wp_fixture f,wp_offer o;
update wp_fixture set p=jsonb_set(jsonb_set(p,'{days,1,range}','{"start":"10:00","end":"12:00"}'),'{days,2,range}','{"start":"10:00","end":"12:00"}');
update wp_command set command=jsonb_build_object('employee_id',emp,'source','employee','expected_revision',1,'settings_revision',2,'preference',p),request_key=gen_random_uuid() from wp_fixture;
select is(jsonb_array_length(public.weekly_preferences_preview_service(actor,w,command)->'items'),5,'three incoming applications, swap receiver and accepted Line Up offer need decisions; outgoing cover excluded') from wp_fixture,wp_command;
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture,wp_command$$,'PT409',null,'missing decisions abort save');
select is(public.weekly_preferences_read_service(actor,w)->'employee'->>'revision','1','failed save did not alter preferences') from wp_fixture;
create temp table wp_choices as select jsonb_agg(item||jsonb_build_object('action',case when item->>'kind'='lineup_offer' or item->>'id'=(select aid::text from wp_requests where i=2) then 'cancel' else 'keep' end) order by item->>'id') decisions
 from wp_fixture,wp_command cross join lateral jsonb_array_elements(public.weekly_preferences_preview_service(actor,w,command)->'items') item;
update wp_command set command=command||jsonb_build_object('decisions',decisions) from wp_choices;
select throws_ok($$select public.weekly_preferences_save_service(actor,w,jsonb_set(command,'{preference,days,1,range,end}','"13:00"'),gen_random_uuid()) from wp_fixture,wp_command$$,'PT409',null,'changed conflict requires fresh decisions');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,jsonb_set(command,'{decisions}',command->'decisions'||jsonb_build_array(jsonb_build_object('kind','exchange_application','id',gen_random_uuid(),'action','cancel','fingerprint',repeat('0',64)))),gen_random_uuid()) from wp_fixture,wp_command$$,'42501',null,'foreign request choice aborts the whole transaction');
select is((select status from public.shift_exchange_applications where id=(select aid from wp_requests where i=2)),'pending_manager','earlier cancellation rolled back on later error');
select is((select status from public.lineup_proposals where id=(select id from wp_offer)),'accepted','Line Up cancellation rolled back on later error');
-- A manager won approval after preview. Saving must not revoke their assignment.
update public.shift_exchange_applications set status='approved' where id=(select aid from wp_requests where i=3);
update public.shift_exchange_cases set status='completed' where id=(select cid from wp_requests where i=3);
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture$$,'mixed keep/cancel and finalized race save atomically');
select is(result->>'kept_count','2','incoming pickup and swap kept') from wp_command;
select is(result->>'cancelled_count','2','incoming application and accepted Line Up offer withdrawn') from wp_command;
select is(jsonb_array_length(result->'finalized'),1,'finalized race separately reported') from wp_command;
select is((select status from public.shift_exchange_applications where id=(select aid from wp_requests where i=3)),'approved','finalized assignment consent preserved');
select is((select status from public.shift_exchange_applications where id=(select aid from wp_requests where i=2)),'withdrawn','requested application withdrawn');
select is((select status from public.lineup_proposals where id=(select id from wp_offer)),'declined','accepted offer withdrawn using existing declined lifecycle');
select is((select status from public.shift_exchange_cases where id=(select cid from wp_requests where i=5)),'open','giving away own shift remains untouched');
select is(result->'model'->'employee'->>'revision','2','employee changes apply immediately despite finalized race') from wp_command;
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture,wp_command$$,'atomic mutation retry succeeds');
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wp_fixture)),4::bigint,'only successful unique commands audited');
update wp_command set command=(command-'decisions')||'{"expected_revision":2}';
update wp_command set command=jsonb_set(command,'{preference,days,3,all_day}','true');
select is(jsonb_array_length(public.weekly_preferences_preview_service(actor,w,command)->'items'),0,'unrelated weekly edit does not re-prompt retained requests') from wp_fixture,wp_command;
select ok(not has_function_privilege('authenticated','public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid)','execute'),'client cannot impersonate save actor');
select ok(not has_table_privilege('authenticated','public.weekly_preference_events','select'),'private before/after audit unavailable to direct employee reads');
-- Earlier workflow requests are still visible in the employee Hub and must not
-- bypass the same incoming-request review during the transition.
create temp table wp_legacy as select gen_random_uuid() publication,gen_random_uuid() job,gen_random_uuid() shift,gen_random_uuid() owned_shift,gen_random_uuid() incoming,gen_random_uuid() outgoing;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,kind)
 select w,emp,1,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d),'employee',actor,'2035-01-15','weekly' from wp_fixture;
insert into public.jobs(id,workspace_id,name,color) select job,w,'Legacy test job','#256b56' from wp_legacy,wp_fixture;
-- A shift is refused now unless the person holds an active assignment to its
-- job as well as its location. The fixture gave them the location only,
-- because that was the whole of the rule when it was written.
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
 select w,emp,job,owner_id from wp_legacy,wp_fixture;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select publication,w,loc,'2035-01-15',1,owner_id from wp_legacy,wp_fixture;
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,job_id,scheduled_date,start_time,end_time,source_shift_id,time_basis,time_timezone,employee_id)
 select shift,w,loc,publication,job,'2035-01-15'::date,'13:00'::time,'15:00'::time,gen_random_uuid(),'explicit','UTC',null from wp_legacy,wp_fixture
 union all select owned_shift,w,loc,publication,job,'2035-01-15','13:00','15:00',gen_random_uuid(),'explicit','UTC',emp from wp_legacy,wp_fixture;
insert into public.schedule_shift_change_requests(id,workspace_id,request_type,offered_shift_id,created_by)
 select incoming,w,'release_pickup'::public.shift_change_request_type,shift,actor from wp_legacy,wp_fixture
 union all select outgoing,w,'release_pickup',owned_shift,actor from wp_legacy,wp_fixture;
insert into public.schedule_shift_change_participants(workspace_id,request_id,employee_id,participant_role)
 select w,incoming,emp,'receiver'::public.shift_change_participant_role from wp_legacy,wp_fixture union all select w,outgoing,emp,'giver' from wp_legacy,wp_fixture;
update wp_command set command=jsonb_set(command,'{preference,days,1,range}','{"start":"13:00","end":"14:00"}'),request_key=gen_random_uuid();
select is((select count(*) from wp_fixture,wp_command cross join lateral jsonb_array_elements(public.weekly_preferences_preview_service(actor,w,command)->'items') item where item->>'kind'='legacy_request'),1::bigint,'legacy incoming pickup included and outgoing release excluded');
update wp_command set command=command||jsonb_build_object('decisions',(select jsonb_agg(item||jsonb_build_object('action',case when item->>'kind'='legacy_request' then 'cancel' else 'keep' end))
 from wp_fixture cross join lateral jsonb_array_elements(public.weekly_preferences_preview_service(actor,w,command)->'items') item));
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture,wp_command$$,'legacy cancellation participates in atomic save');
select is((select status::text from public.schedule_shift_change_requests where id=(select incoming from wp_legacy)),'cancelled','legacy incoming request cancelled');
select is((select status::text from public.schedule_shift_change_requests where id=(select outgoing from wp_legacy)),'pending_manager_approval','legacy giving-away request unchanged');
select is((select employee_id from public.schedule_published_shifts where id=(select owned_shift from wp_legacy)),(select emp from wp_fixture),'existing assigned shift untouched');
select * from finish();
rollback;
