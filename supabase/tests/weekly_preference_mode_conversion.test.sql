-- Changing the availability entry mode converts every saved week in the
-- workspace: the employee's own week and the manager's reminder week alike.
-- The days record UNAVAILABLE time; an empty day is a fully available day.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table cv as select
 'a5e10000-0000-4000-8000-000000000001'::uuid w,
 'a5e10000-0000-4000-8000-000000000002'::uuid owner_id,
 'a5e10000-0000-4000-8000-000000000003'::uuid a_user,
 'a5e10000-0000-4000-8000-000000000004'::uuid b_user,
 'a5e10000-0000-4000-8000-000000000005'::uuid c_user,
 'a5e10000-0000-4000-8000-000000000006'::uuid d_user,
 'a5e10000-0000-4000-8000-000000000011'::uuid a,
 'a5e10000-0000-4000-8000-000000000012'::uuid b,
 'a5e10000-0000-4000-8000-000000000013'::uuid c,
 'a5e10000-0000-4000-8000-000000000014'::uuid d,
 'a5e10000-0000-4000-8000-000000000021'::uuid lunch,
 'a5e10000-0000-4000-8000-000000000022'::uuid dinner,
 'a5e10000-0000-4000-8000-000000000023'::uuid late,
 'a5e10000-0000-4000-8000-000000000024'::uuid brunch;
insert into auth.users(id,email) select owner_id,'conversion-owner@example.test' from cv
 union all select a_user,'conversion-a@example.test' from cv union all select b_user,'conversion-b@example.test' from cv
 union all select c_user,'conversion-c@example.test' from cv union all select d_user,'conversion-d@example.test' from cv;
insert into public.workspaces(id,name,created_by) select w,'Mode conversion test',owner_id from cv;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from cv
 union all select w,a_user,'employee'::public.workspace_role,false from cv union all select w,b_user,'employee'::public.workspace_role,false from cv
 union all select w,c_user,'employee'::public.workspace_role,false from cv union all select w,d_user,'employee'::public.workspace_role,false from cv;
insert into public.workspace_scheduling_settings(workspace_id) select w from cv on conflict do nothing;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select a,w,a_user,'E-5101','Ayse','Week',owner_id from cv union all select b,w,b_user,'E-5102','Burak','Week',owner_id from cv
 union all select c,w,c_user,'E-5103','Cem','Week',owner_id from cv union all select d,w,d_user,'E-5104','Deniz','Week',owner_id from cv;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time,sort_order)
 select lunch,w,'Lunch','#256b56','11:30'::time,'15:30'::time,0 from cv
 union all select dinner,w,'Dinner','#256b56','16:15'::time,'23:30'::time,1 from cv
 union all select late,w,'Late','#256b56','22:00'::time,'02:00'::time,2 from cv
 union all select brunch,w,'Brunch','#256b56','09:00'::time,'11:00'::time,3 from cv;
-- Brunch was chosen by somebody once and archived since: its hours survive, it
-- is no longer offered, and a time range never converts into it.
update public.shift_types set archived_at=now() where id=(select brunch from cv);

create function pg_temp.free(weekday integer) returns jsonb language sql as $$
 select jsonb_build_object('day',weekday,'all_day',false,'ranges','[]'::jsonb,'shift_type_ids','[]'::jsonb) $$;
create function pg_temp.whole(weekday integer) returns jsonb language sql as $$
 select jsonb_build_object('day',weekday,'all_day',true,'ranges','[]'::jsonb,'shift_type_ids','[]'::jsonb) $$;
create function pg_temp.hours(weekday integer,start_clock text,end_clock text) returns jsonb language sql as $$
 select jsonb_build_object('day',weekday,'all_day',false,'ranges',jsonb_build_array(jsonb_build_object('start',start_clock,'end',end_clock)),'shift_type_ids','[]'::jsonb) $$;
create function pg_temp.spans(weekday integer,variadic clocks text[]) returns jsonb language sql as $$
 select jsonb_build_object('day',weekday,'all_day',false,'ranges',(select jsonb_agg(jsonb_build_object('start',clocks[i],'end',clocks[i+1]) order by i)
  from generate_series(1,array_length(clocks,1),2) i),'shift_type_ids','[]'::jsonb) $$;
-- What a week marks unavailable, minute by minute, over one UTC week from Sunday.
create function pg_temp.minutes(preference jsonb) returns tstzmultirange language sql as $$
 select public.weekly_preference_intersections((select w from cv),preference,'[2035-01-07 00:00Z,2035-01-14 00:00Z)','UTC') $$;
create function pg_temp.types(weekday integer,variadic ids uuid[]) returns jsonb language sql as $$
 select jsonb_build_object('day',weekday,'all_day',false,'ranges','[]'::jsonb,'shift_type_ids',to_jsonb(ids)) $$;
create function pg_temp.week(mode text,variadic days jsonb[]) returns jsonb language sql as $$
 select jsonb_build_object('input_mode',mode,'days',to_jsonb(days)) $$;
create function pg_temp.day(emp uuid,weekday integer,source text default 'employee') returns jsonb language sql as $$
 select value from jsonb_array_elements(case when source='employee'
  then (select preference from public.employee_weekly_preferences where employee_id=emp)
  else (select preference from public.manager_weekly_reminders where employee_id=emp) end->'days') where (value->>'day')::integer=weekday $$;
create function pg_temp.switch_mode(mode text,revision integer,key_suffix integer) returns jsonb language sql as $$
 select public.weekly_preference_settings_save_service(owner_id,w,
  jsonb_build_object('input_mode',mode,'onboarding_required',false,'expected_revision',revision),
  ('a5e20000-0000-4000-8000-'||lpad(key_suffix::text,12,'0'))::uuid) from cv $$;

-- Ayse's week holds one time-to-type case per day. Lunch 11:30-15:30,
-- Dinner 16:15-23:30, Late 22:00-02:00 (crosses midnight).
create temp table a_week as select pg_temp.week('time_range',pg_temp.free(0),pg_temp.whole(1),
 pg_temp.hours(2,'09:00','11:00'),pg_temp.hours(3,'15:29','16:00'),pg_temp.hours(4,'15:30','17:00'),
 pg_temp.hours(5,'15:00','17:00'),pg_temp.hours(6,'23:00','24:00')) p;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,a,(select p from a_week),1,a_user from cv;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by,notes)
 select w,a,pg_temp.week('time_range',pg_temp.free(0),pg_temp.hours(1,'09:00','11:00'),pg_temp.free(2),
  pg_temp.hours(3,'15:00','17:00'),pg_temp.free(4),pg_temp.free(5),pg_temp.free(6)),1,owner_id,
  array['','Private manager note','','','','',''] from cv;

select is(pg_temp.switch_mode('shift_type',0,1)->'settings'->>'input_mode','shift_type','owner switches the workspace to shift types');
select is((select preference->>'input_mode' from public.employee_weekly_preferences where employee_id=(select a from cv)),'shift_type','the saved week follows the new entry mode');
select is(pg_temp.day(a,0),pg_temp.types(0,late),'time to type: Sunday''s Late runs into Monday, marked all day, so it is marked (S3 a)') from cv;
select is(pg_temp.day(a,1),pg_temp.whole(1),'time to type: an all-day day stays all day') from cv;
select is(pg_temp.day(a,2),pg_temp.free(2),'time to type: hours touching no shift type clear the day, which becomes fully available') from cv;
select is(pg_temp.day(a,3),pg_temp.types(3,lunch),'time to type: one minute of overlap (15:29-16:00 against Lunch) marks the type') from cv;
select is(pg_temp.day(a,4),pg_temp.types(4,dinner),'time to type: touching a boundary is not overlap (15:30-17:00 leaves Lunch, which ends 15:30)') from cv;
select is(pg_temp.day(a,5),pg_temp.types(5,lunch,dinner),'time to type: hours reaching two types mark both') from cv;
select is(pg_temp.day(a,6),pg_temp.types(6,dinner,late),'time to type: a type crossing midnight counts by its evening part on that day') from cv;
-- Sağlama (S3 a): no minute marked in hours is lost in types.
-- Hours no type reaches cannot be kept in types (Tuesday above); every minute a
-- type reaches is.
select ok(pg_temp.minutes((select preference from public.employee_weekly_preferences where employee_id=(select a from cv)))
 @> pg_temp.minutes((select p from a_week)) * pg_temp.minutes(pg_temp.week('shift_type',pg_temp.types(0,lunch,dinner,late),pg_temp.types(1,lunch,dinner,late),
  pg_temp.types(2,lunch,dinner,late),pg_temp.types(3,lunch,dinner,late),pg_temp.types(4,lunch,dinner,late),pg_temp.types(5,lunch,dinner,late),
  pg_temp.types(6,lunch,dinner,late))),'time to type: every unavailable minute a shift type reaches is still unavailable') from cv;
select is((select row(revision,updated_by)::text from public.employee_weekly_preferences where employee_id=(select a from cv)),
 row(2,(select owner_id from cv))::text,'the converted week is a new revision written by the person who changed the mode');
select is((select preference from public.manager_weekly_reminders where employee_id=(select a from cv)),
 pg_temp.week('shift_type',pg_temp.free(0),pg_temp.free(1),pg_temp.free(2),pg_temp.types(3,lunch,dinner),pg_temp.free(4),pg_temp.free(5),pg_temp.free(6)),
 'the manager reminder week converts by the same rules') from cv;
select is((select row(revision,notes[2],enabled)::text from public.manager_weekly_reminders where employee_id=(select a from cv)),
 row(2,'Private manager note',true)::text,'manager notes and the reminder switch survive the conversion');
select is((select before_record->'preference' from public.weekly_preference_events where employee_id=(select a from cv) and source='employee'),
 (select p from a_week),'the week as it was before the conversion is kept in its history');
select is((select after_record->'preference' from public.weekly_preference_events where employee_id=(select a from cv) and source='employee'),
 (select preference from public.employee_weekly_preferences where employee_id=(select a from cv)),'the history says what the week became');
select is((select count(*) from public.weekly_preference_events where employee_id=(select a from cv) and source='manager' and actor_user_id=(select owner_id from cv)),
 1::bigint,'the reminder week has its own history entry');
select is((select count(*) from public.employee_weekly_preferences where employee_id=(select c from cv)),0::bigint,'a mode change does not invent a week for somebody who never saved one');

-- Burak saved his week in shift types. Deniz's week names a type nobody can
-- resolve hours for; it must stop the switch rather than lose the day.
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,b,pg_temp.week('shift_type',pg_temp.free(0),pg_temp.whole(1),pg_temp.types(2,lunch),pg_temp.types(3,lunch,dinner),
  pg_temp.types(4,late),pg_temp.types(5,brunch),pg_temp.types(6,late,lunch)),1,b_user from cv;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,d,pg_temp.week('shift_type',pg_temp.free(0),pg_temp.free(1),pg_temp.types(2,'a5e10000-0000-4000-8000-0000000000ff'::uuid),
  pg_temp.free(3),pg_temp.free(4),pg_temp.free(5),pg_temp.free(6)),1,d_user from cv;
select throws_ok($$select pg_temp.switch_mode('time_range',1,2)$$,'22023',null,'a week that cannot be converted stops the mode change');
select is((select availability_input_mode from public.workspace_scheduling_settings where workspace_id=(select w from cv)),'shift_type','the refused change leaves the mode as it was');
select is((select preference->'days'->3 from public.employee_weekly_preferences where employee_id=(select b from cv)),pg_temp.types(3,lunch,dinner),'no week is half-converted by the refused change') from cv;
delete from public.employee_weekly_preferences where employee_id=(select d from cv);

select is(pg_temp.switch_mode('time_range',1,3)->'settings'->>'input_mode','time_range','owner switches back to time ranges');
select is(pg_temp.day(b,0),pg_temp.spans(0,'00:00','02:00'),'type to time: Saturday''s Late goes on past midnight into Sunday (S2 a)') from cv;
select is(pg_temp.day(b,1),pg_temp.whole(1),'type to time: an all-day day stays all day') from cv;
select is(pg_temp.day(b,2),pg_temp.hours(2,'11:30','15:30'),'type to time: one type becomes its own hours') from cv;
select is(pg_temp.day(b,3),pg_temp.spans(3,'11:30','15:30','16:15','23:30'),'type to time: Lunch and Dinner stay two ranges; the gap between them stays available') from cv;
select is(pg_temp.day(b,4),pg_temp.hours(4,'22:00','24:00'),'type to time: a type crossing midnight fills its evening') from cv;
select is(pg_temp.day(b,5),pg_temp.spans(5,'00:00','02:00','09:00','11:00'),'type to time: the night before goes on into Friday; an archived type keeps its last saved hours') from cv;
select is(pg_temp.day(b,6),pg_temp.spans(6,'11:30','15:30','22:00','24:00'),'type to time: the order the types were picked in does not matter') from cv;
-- Sağlama (S2 a): the week in hours marks exactly the minutes the types did.
select is(pg_temp.minutes((select preference from public.employee_weekly_preferences where employee_id=(select b from cv))),
 pg_temp.minutes((select e.before_record->'preference' from public.weekly_preference_events e where e.employee_id=(select b from cv) and e.source='employee' order by e.created_at desc limit 1)),
 'type to time: not one unavailable minute gained or lost');
select is(pg_temp.day(a,5),pg_temp.spans(5,'11:30','15:30','16:15','23:30'),'a round trip widens hours by the rules: Friday 15:00-17:00 comes back as Lunch and Dinner') from cv;
select is(pg_temp.day(a,2),pg_temp.free(2),'a round trip does not bring back hours the first conversion cleared') from cv;
select ok((select bool_and(public.weekly_preference_valid(preference)) from public.employee_weekly_preferences where workspace_id=(select w from cv)),'every converted week is a valid week');
select * from finish();
rollback;
