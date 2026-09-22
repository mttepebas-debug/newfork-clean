begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table atr as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,'af9d0000-0000-4000-8000-000000000001'::uuid actor,
 'af9d0000-0000-4000-8000-000000000002'::uuid emp,'11000000-0000-4000-8000-000000000001'::uuid loc,
 'af9d0000-0000-4000-8000-000000000003'::uuid lunch,'af9d0000-0000-4000-8000-000000000004'::uuid dinner,
 '2035-01-15'::date starts,null::uuid request,null::jsonb result,
 jsonb_build_object('timezone','UTC','effective_from','2035-01-15','effective_until',null,
  'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d)) p;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-types@example.test','','{}','{}',now(),now() from atr;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from atr;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-994950','Service','Tester',manager from atr;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,manager from atr;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
-- Dinner used to have no hours at all. A shift type cannot be created without
-- them now, so it gets Lunch's exact hours instead -- which keeps the harder
-- half of what this suite proves: a restriction follows the type's name, not
-- a clock that happens to match.
select lunch,w,'Semantic Lunch','#123456','12:00'::time,'16:00'::time from atr union all select dinner,w,'Semantic Dinner','#123456','12:00'::time,'16:00'::time from atr;
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='narrowing',availability_initial_review=false,availability_notice_days=0,availability_enforcement='soft' where workspace_id=(select w from atr);
create function pg_temp.atr_submit(proposal jsonb) returns jsonb language sql as $$
 select public.availability_command_service(actor,w,jsonb_build_object('action','submit','employee_id',emp,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
  'proposal',proposal,'policy_revision',(select availability_policy_revision from public.workspace_scheduling_settings where workspace_id=t.w)),gen_random_uuid()) from atr t;
$$;
create function pg_temp.atr_decide(action text) returns jsonb language sql as $$
 select public.availability_command_service(manager,w,jsonb_build_object('action',action,'employee_id',emp,'request_id',request,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
  'expected_request_revision',(select revision from public.availability_requests where id=t.request),'reason','Service restriction reviewed',
  'policy_revision',(select availability_policy_revision from public.workspace_scheduling_settings where workspace_id=t.w)),gen_random_uuid()) from atr t;
$$;
create function pg_temp.atr_assess(patch jsonb default '{}') returns jsonb language sql as $$
 select public.assess_shift_availability(w,emp,jsonb_build_object('location_id',loc,'employee_id',emp,'shift_type_id',lunch,'scheduled_date','2035-01-15',
 'time_basis','explicit','time_timezone','UTC','start_time','18:00','end_time','20:00')||patch) from atr;
$$;
select is(pg_temp.atr_submit(p)->>'status','effective','initial clock-only report remains compatible') from atr;
select is(pg_temp.atr_assess()->>'operation','allowed','clock-only availability allows explicit hours outside Lunch defaults');
select is(jsonb_array_length(pg_temp.atr_assess()->'type_restrictions'),0,'clock shortcuts do not create a semantic restriction');
select throws_ok($$select public.validate_availability_shift_types(w,jsonb_set(p->'days','{1,blocked_shift_type_ids}','null')) from atr$$,'22023',null,'null is not a type list');
select throws_ok($$select public.validate_availability_shift_types(w,jsonb_set(p->'days','{1,blocked_shift_type_ids}',jsonb_build_array(lunch,lunch))) from atr$$,'22023',null,'duplicate type identities rejected');
select throws_ok($$select public.validate_availability_shift_types(w,jsonb_set(p->'days','{1,blocked_shift_type_ids}',jsonb_build_array(gen_random_uuid()))) from atr$$,'22023',null,'unrelated or missing types rejected');
update atr set p=jsonb_set(p,'{days,1,blocked_shift_type_ids}',jsonb_build_array(lunch));
select is(public.availability_change_narrows(w,emp,p),true,'new type restriction narrows even when all clock hours remain available') from atr;
update atr set result=pg_temp.atr_submit(p); update atr set request=(result->>'request_id')::uuid;
select is(result->>'status','pending_review','organization narrowing approval applies to semantic restrictions') from atr;
select is(pg_temp.atr_assess()->>'operation','verification_required','pending service restriction blocks publication until reviewed');
select is((select capacity_notice_open from public.availability_requests where id=(select request from atr)),true,'new service restriction opens a capacity notice');
select is(pg_temp.atr_decide('approve')->>'status','effective','manager approval activates service restriction');
select is(pg_temp.atr_assess()->>'coverage','full','semantic result preserves independent physical-hour coverage');
select is(pg_temp.atr_assess()->>'operation','warning_requires_override','soft type restriction requires an explicit override');
select is(pg_temp.atr_assess()->'reasons'->0->>'code','shift_type_restricted','assessment explains the service restriction');
select is(pg_temp.atr_assess()->'type_restrictions'->0->>'shift_type_id',lunch::text,'assessment evidence carries the restricted type identity') from atr;
select is(pg_temp.atr_assess(jsonb_build_object('shift_type_id',dinner))->>'operation','allowed','different named service is not inferred from matching default hours') from atr;
select is(pg_temp.atr_assess('{"shift_type_id":null}')->>'operation','verification_required','deleting type identity cannot silently bypass a restriction');
select is(pg_temp.atr_assess('{"scheduled_date":"2035-01-16"}')->>'operation','allowed','restriction applies only to its availability weekday');
select is(pg_temp.atr_assess('{"scheduled_date":"2035-01-14","start_time":"23:00","end_time":"01:00"}')->>'operation','verification_required','overnight evaluates missing prior availability and the next restricted weekday');
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from atr);
select is(pg_temp.atr_assess()->>'operation','blocked','hard type restriction blocks even explicitly different hours');
select is(pg_temp.atr_assess('{"time_basis":"unresolved","start_time":null,"end_time":null}')->>'operation','blocked','known restricted type is blocked even when its hours are unresolved');
select is(pg_temp.atr_assess('{"shift_type_id":null}')->>'operation','verification_required','unclassified service needs verification under hard policy too');
select throws_ok($$select public.schedule_prepare_availability_assignment(manager,w,jsonb_build_object('id',gen_random_uuid(),'location_id',loc,'employee_id',emp,'shift_type_id',lunch,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','18:00','end_time','20:00'),null) from atr$$,'23514',null,'actual assignment preparation rejects hard type conflict before a write');
select is(public.assess_shift_availability(w,emp,public.normalize_schedule_time_source(w,jsonb_build_object('location_id',loc,'employee_id',emp,'shift_type_id',lunch,'scheduled_date','2035-01-15','time_basis','type_default','hide_time_on_badge',true)))->>'operation','blocked','name-only assignment obeys semantic restriction') from atr;
-- Renaming/default changes/archive retain identity; no saved availability moves.
update public.shift_types set name='Renamed Lunch',default_start_time='21:00',default_end_time='23:00',archived_at=now() where id=(select lunch from atr);
select is(pg_temp.atr_assess()->>'operation','blocked','type rename, default edit and archive cannot erase restriction');
select is((select st->>'archived' from atr cross join lateral jsonb_array_elements(public.availability_read_service(actor,w)->'shift_types') st where st->>'id'=lunch::text),'true','employee catalog preserves archived type labels referenced by history');
select is((select st->>'name' from atr cross join lateral jsonb_array_elements(public.availability_read_service(manager,w,emp)->'shift_types') st where st->>'id'=lunch::text),'Renamed Lunch','manager sees the same type identity and label');
select is(public.availability_read_service(actor,w)->>'time_format',(select time_format::text from public.workspace_scheduling_settings where workspace_id=(select w from atr)),'recurring editor reads organization time format') from atr;
select is(public.availability_change_narrows(w,emp,p),false,'unchanged semantic restriction does not trigger false narrowing') from atr;
select is(public.availability_change_narrows(w,emp,jsonb_set(p,'{days,1,blocked_shift_type_ids}','[]')),false,'removing a service restriction is expansion rather than narrowing') from atr;
-- Reuse physical source masks for temporary patterns and timezone crossings.
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select w,emp,3,'UTC',jsonb_set(p->'days','{1,blocked_shift_type_ids}','[]'),'employee',actor,'2035-01-22','2035-01-22','temporary' from atr;
select is(pg_temp.atr_assess('{"scheduled_date":"2035-01-22"}')->>'operation','allowed','temporary pattern overrides the weekly service restriction for its dates');
select is(pg_temp.atr_assess('{"scheduled_date":"2035-01-29"}')->>'operation','blocked','weekly service restriction returns after temporary expiry');
select is(jsonb_array_length(public.availability_shift_type_rules(w,emp,'[2035-01-15 06:00Z,2035-01-15 08:00Z)',p||'{"timezone":"America/Los_Angeles","effective_from":"2035-01-14"}'::jsonb)),0,'restriction uses availability timezone rather than UTC date') from atr;
select is(jsonb_array_length(public.availability_shift_type_rules(w,emp,'[2035-01-15 08:00Z,2035-01-15 10:00Z)',p||'{"timezone":"America/Los_Angeles","effective_from":"2035-01-14"}'::jsonb)),1,'restriction begins at the actual availability-zone day boundary') from atr;
select throws_ok($$update public.employee_schedule_availability_versions set recurring_rules=jsonb_set(recurring_rules,'{1,blocked_shift_type_ids}','[]') where employee_id=(select emp from atr)$$,'23514',null,'approved service restrictions remain versioned and immutable');
set local role authenticated;
select throws_ok($$select public.availability_shift_type_rules(null,null,null)$$,'42501',null,'service rule evidence is private');
reset role;
select * from finish();
rollback;
