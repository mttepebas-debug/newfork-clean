begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Saving a week with nothing changed tells nobody (S-32, KK-178 K3; BL-790): the
-- first save is news ("Week confirmed."), a later save that changes no day is
-- not, so the managers, admins and owner are not notified again. The save itself
-- still happens: the revision moves on and the history keeps the row.
create temp table wq_fixture as select
 'ad790000-0000-4000-8000-000000000001'::uuid w,
 'ad790000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad790000-0000-4000-8000-000000000003'::uuid actor,
 'ad790000-0000-4000-8000-000000000004'::uuid emp,
 'ad790000-0000-4000-8000-000000000005'::uuid manager,
 'ad790000-0000-4000-8000-000000000006'::uuid loc;
insert into auth.users(id,email) select owner_id,'weekly-quiet-owner@example.test' from wq_fixture
 union all select actor,'weekly-quiet-employee@example.test' from wq_fixture
 union all select manager,'weekly-quiet-manager@example.test' from wq_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly quiet save test',owner_id from wq_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wq_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wq_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wq_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wq_fixture on conflict do nothing;
insert into public.locations(short_name,id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00091',loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wq_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993790','Quiet','Saver',owner_id from wq_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wq_fixture;
select tests.works_at(m.id,f.loc) from wq_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id=f.manager;

-- The employee saves this week, read back first so every save carries the
-- revisions the screen would.
create function pg_temp.save(week jsonb) returns jsonb language sql as $$
 select public.weekly_preferences_save_service(f.actor,f.w,jsonb_build_object('employee_id',f.emp,'source','employee',
  'expected_revision',(m.model->'employee'->>'revision')::integer,'settings_revision',(m.model->'settings'->>'revision')::integer,
  'preference',week),gen_random_uuid())
 from wq_fixture f cross join lateral (select public.weekly_preferences_read_service(f.actor,f.w) model) m $$;
create function pg_temp.told() returns bigint language sql as $$
 select count(*) from public.notification_outbox o join wq_fixture f on o.workspace_id=f.w
 where o.subject_type='weekly_availability' and o.subject_id=f.emp::text $$;
-- Every save in the transaction has the same now(): ask which messages exist.
create function pg_temp.told_that(body text) returns bigint language sql as $$
 select count(*) from public.notification_outbox o join wq_fixture f on o.workspace_id=f.w
 where o.subject_type='weekly_availability' and o.subject_id=f.emp::text and o.payload->>'body'=told_that.body $$;
create temp table wq_week as select public.empty_weekly_preference('time_range') open_week,
 jsonb_set(public.empty_weekly_preference('time_range'),'{days,2,ranges}','[{"start":"18:00","end":"23:00"}]') tuesday_evening;

-- 1. The first save is news even with nothing marked: the week is confirmed.
select is((pg_temp.save(open_week)->'model'->'employee'->>'revision'),'1','the first save of a fully available week is saved') from wq_week;
select is(pg_temp.told(),1::bigint,'the first save tells the managers');
select is(pg_temp.told_that('Quiet Saver: Weekly availability updated. Week confirmed.'),1::bigint,'and says the week is confirmed');
select ok((select payload->'recipient_user_ids' @> jsonb_build_array(f.owner_id,f.manager) from public.notification_outbox o,wq_fixture f
 where o.workspace_id=f.w and o.subject_type='weekly_availability'),'the owner and the West manager are told');

-- 2. Saving the same week again changes nothing, so nobody is told.
select is((pg_temp.save(open_week)->'model'->'employee'->>'revision'),'2','an unchanged week still saves') from wq_week;
select is(pg_temp.told(),1::bigint,'an unchanged save tells nobody');
select is((select count(*) from public.weekly_preference_events e join wq_fixture f on e.workspace_id=f.w),2::bigint,'the history keeps the unchanged save');
select is((select count(*) from public.employee_events e join wq_fixture f on e.workspace_id=f.w and e.employee_id=f.emp
 where e.summary='Weekly availability updated. Week confirmed.'),2::bigint,'and the person''s history says the week was confirmed again');

-- 3. A changed day is news again, and says which day.
select is((pg_temp.save(tuesday_evening)->'model'->'employee'->>'revision'),'3','a changed week saves') from wq_week;
select is(pg_temp.told(),2::bigint,'a changed day tells the managers');
select is(pg_temp.told_that('Quiet Saver: Weekly availability updated. Changed days: Tue.'),1::bigint,'and names the changed day');

-- 4. Saving that week once more is quiet again.
select is((pg_temp.save(tuesday_evening)->'model'->'employee'->>'revision'),'4','the same changed week saves again') from wq_week;
select is(pg_temp.told(),2::bigint,'saving it unchanged tells nobody');

-- 5. Clearing Tuesday again is a change; saving the cleared week once more is not.
select is((pg_temp.save(open_week)->'model'->'employee'->>'revision'),'5','going back to a fully available week saves') from wq_week;
select is(pg_temp.told(),3::bigint,'and is a change the managers hear about');
select is((pg_temp.save(open_week)->'model'->'employee'->>'revision'),'6','the fully available week saved again') from wq_week;
select is(pg_temp.told(),3::bigint,'is quiet');
select * from finish();
rollback;
