begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temp table availability_test_state as select
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid workspace_id,
  '15000000-0000-4000-8000-000000000001'::uuid employee_id,
  '11000000-0000-4000-8000-000000000001'::uuid location_id,
  'a7a00000-0000-4000-8000-000000000001'::uuid actor,
  (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d) rules,
  (select coalesce(max(version_number),0) from public.employee_schedule_availability_versions where employee_id='15000000-0000-4000-8000-000000000001') revision,
  current_date+1000 starts_on;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-v2@example.test','','{}','{}',now(),now() from availability_test_state;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select workspace_id,actor,'employee','active',true from availability_test_state;
update public.employee_profiles set user_id=(select actor from availability_test_state) where id=(select employee_id from availability_test_state);
-- This suite isolates publication immutability; review policies have their own suite.
update public.workspace_scheduling_settings set availability_approval='none',availability_initial_review=false,availability_notice_days=0
where workspace_id=(select workspace_id from availability_test_state);

select lives_ok($$select public.validate_availability_week('America/Los_Angeles',rules) from availability_test_state$$,'complete week accepted');
select throws_ok($$select public.validate_availability_week('Mars/Olympus',rules) from availability_test_state$$,'22023',null,'invalid timezone rejected in DB');
select throws_ok($$select public.validate_availability_week('UTC',jsonb_set(rules,'{0}', '{"day":0,"mode":"windows","windows":[]}')) from availability_test_state$$,'22023',null,'empty windows rejected');
select throws_ok($$select public.validate_availability_week('UTC',jsonb_set(rules,'{0}', '{"day":0,"mode":"windows","windows":[{"start":"17:00","end":"10:00"}]}')) from availability_test_state$$,'22023',null,'reversed windows rejected');
select throws_ok($$select public.validate_availability_week('UTC',jsonb_set(rules,'{0}', '{"day":0,"mode":"windows","windows":[{"start":"09:00","end":"13:00"},{"start":"12:00","end":"17:00"}]}')) from availability_test_state$$,'22023',null,'overlap rejected');
select lives_ok($$select public.validate_availability_week('UTC',jsonb_set(rules,'{0}', '{"day":0,"mode":"windows","windows":[{"start":"09:00","end":"13:00"},{"start":"13:00","end":"24:00"}]}')) from availability_test_state$$,'adjacent ranges and midnight accepted');

select is((public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on,null,revision)->>'revision')::integer,revision+1,'new version saved with revision') from availability_test_state;
select throws_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on,null,revision) from availability_test_state$$,'40001',null,'stale editor cannot overwrite newer version');
update availability_test_state set revision=revision+1;

insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
select workspace_id,location_id,starts_on,1,actor from availability_test_state;
select ok(exists(select 1 from public.availability_publication_locks l join availability_test_state s on l.workspace_id=s.workspace_id and l.location_id=s.location_id and l.week_start=s.starts_on),'publication persists lock');
select throws_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on+2,starts_on+3,revision) from availability_test_state$$,'23514',null,'published dates cannot be edited');
select throws_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on-2,null,revision) from availability_test_state$$,'23514',null,'recurring rule cannot cross a published future week');

update public.schedule_location_publications set status='unpublished',unpublished_by=(select actor from availability_test_state),unpublished_at=now()
where location_id=(select location_id from availability_test_state) and week_start=(select starts_on from availability_test_state);
select throws_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on+6,null,revision) from availability_test_state$$,'23514',null,'unpublish does not unlock availability');
select lives_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on-2,starts_on-1,revision) from availability_test_state$$,'bounded unpublished gap can be changed');
update availability_test_state set revision=revision+1;
select lives_ok($$select public.save_employee_availability_v2_service(actor,workspace_id,'UTC',rules,starts_on+7,null,revision) from availability_test_state$$,'next unpublished period can be changed');
select throws_ok($$update public.employee_schedule_availability_versions set effective_from=effective_from+1 where employee_id=(select employee_id from availability_test_state)$$,'23514',null,'historical versions cannot be moved to bypass lock');
select ok((public.employee_availability_context_service(actor,workspace_id)->>'suggested_start')::date >= starts_on+7,'employee sees a valid suggested date') from availability_test_state;
select ok(jsonb_array_length(public.employee_availability_context_service(actor,workspace_id)->'published_periods')>0,'employee sees locked periods') from availability_test_state;
select is(public.availability_rules_for_date(employee_id,starts_on),rules,'new future versions do not reinterpret published dates') from availability_test_state;

select lives_ok($$select public.get_schedule_read_model_availability_v2_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5',workspace_id,current_date) from availability_test_state$$,'authorized Schedule read model includes effective versions');
select lives_ok($$select public.get_employee_hub_availability_v2_service(actor,workspace_id,current_date,current_date+14) from availability_test_state$$,'employee hub projects only the currently effective baseline');
insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id)
select s.workspace_id,s.employee_id,m.id from availability_test_state s join public.workspace_memberships m on m.workspace_id=s.workspace_id and m.user_id=s.actor
on conflict (employee_id) do update set membership_id=excluded.membership_id;
update availability_test_state set revision=revision+1;
select lives_ok($$select public.save_onboarding_availability_v2_service(s.actor,'UTC',s.rules,c.revision,s.starts_on+14,null,s.revision)
from availability_test_state s join public.employee_onboarding_cases c on c.employee_id=s.employee_id$$,'onboarding saves through the same publication and revision guard');
select is((select source from public.employee_schedule_availability_versions where employee_id=s.employee_id order by version_number desc limit 1),'onboarding','onboarding writes canonical operational availability') from availability_test_state s;
select throws_ok($$select public.save_onboarding_availability_v2_service(s.actor,'UTC',s.rules,c.revision,s.starts_on+1,null,s.revision+1)
from availability_test_state s join public.employee_onboarding_cases c on c.employee_id=s.employee_id$$,'23514',null,'onboarding cannot bypass a published period');

set local role authenticated;
select throws_ok($$select public.save_employee_availability_v2_service('a7a00000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','UTC','[]',current_date,null,1)$$,'42501',null,'authenticated callers cannot spoof a service actor');
select throws_ok($$select * from public.availability_publication_locks$$,'42501',null,'lock data is not directly exposed');
reset role;
select throws_ok($$select public.employee_availability_context_service(actor,'00000000-0000-4000-8000-000000000099') from availability_test_state$$,'42501',null,'cross-workspace context rejected');

select * from finish();
rollback;
