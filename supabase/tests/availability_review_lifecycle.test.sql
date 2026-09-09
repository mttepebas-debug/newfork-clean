begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table av_state as select
 '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'ab910000-0000-4000-8000-000000000001'::uuid emp,
 'ab920000-0000-4000-8000-000000000001'::uuid employee_actor,
 'ab920000-0000-4000-8000-000000000002'::uuid manager_actor,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid owner_actor,
 '11000000-0000-4000-8000-000000000001'::uuid loc,
 current_date+2500 starts,
 jsonb_build_object('timezone','UTC','effective_from',current_date+2500,'effective_until',null,
  'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d)) p;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@availability.test','','{}','{}',now(),now()
from av_state cross join lateral (values(employee_actor),(manager_actor)) users(id);
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select w,employee_actor,'employee','active',true from av_state;
insert into public.workspace_memberships(workspace_id,user_id,role,role_id,status,all_locations)
select s.w,s.manager_actor,'manager',m.role_id,'active',true from av_state s join public.workspace_memberships m on m.user_id=s.owner_actor and m.workspace_id=s.w;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,employee_actor,'E-992190','Availability','Review',owner_actor from av_state;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
select w,emp,loc,true,owner_actor from av_state;
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='narrowing',availability_initial_review=false,availability_notice_days=0
where workspace_id=(select w from av_state);

create temp table av_last(request_id uuid);
create or replace function pg_temp.av_cmd(who uuid,action_name text,extra jsonb default '{}',retry_key uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare s av_state%rowtype; r public.availability_requests%rowtype; rev integer; policy integer; command jsonb; result jsonb;
begin
 select * into s from av_state;
 select * into r from public.availability_requests where id=(select request_id from av_last);
 select coalesce(max(version_number),0) into rev from public.employee_schedule_availability_versions where employee_id=s.emp;
 select availability_policy_revision into policy from public.workspace_scheduling_settings where workspace_id=s.w;
 command:=jsonb_build_object('employee_id',s.emp,'action',action_name,'proposal',s.p,'expected_revision',rev,'request_id',r.id,
  'expected_request_revision',r.revision,'policy_revision',policy)||extra;
 result:=public.availability_command_service(who,s.w,command,retry_key);
 delete from av_last; insert into av_last values((result->>'request_id')::uuid); return result;
end; $$;

select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','effective','initial employee report becomes effective when initial review is disabled') from av_state;
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=s.emp),1,'effective request writes one canonical version') from av_state s;
select is((public.availability_read_service(employee_actor,w)->>'revision')::integer,1,'self read has the canonical revision') from av_state;
select ok((public.availability_read_service(manager_actor,w,emp)->>'can_manage')::boolean,'scoped manager can manage employee') from av_state;
select throws_ok($$select public.availability_read_service(employee_actor,w,gen_random_uuid()) from av_state$$,'42501',null,'another employee cannot be inspected');

update av_state set p=jsonb_set(p,'{days,1}','{"day":1,"mode":"windows","windows":[{"start":"10:00","end":"17:00"}]}');
select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','narrowing waits for review') from av_state;
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=s.emp),1,'pending proposal does not replace effective hours') from av_state s;
select throws_ok($$select pg_temp.av_cmd(employee_actor,'submit') from av_state$$,'40001',null,'overlapping pending proposals require explicit replacement');
select throws_ok($$select pg_temp.av_cmd(employee_actor,'approve') from av_state$$,'42501',null,'employee cannot approve their own availability');
select throws_ok($$select pg_temp.av_cmd(manager_actor,'approve','{"expected_request_revision":0}') from av_state$$,'40001',null,'stale request decision rejected');
select throws_ok($$select pg_temp.av_cmd(manager_actor,'approve','{"policy_revision":0}') from av_state$$,'40001',null,'stale policy decision rejected');
select throws_ok($$insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
select w,loc,starts,1,owner_actor from av_state$$,'23514',null,'commit blocks publication while timely request is pending');
select throws_ok($$select pg_temp.av_cmd(manager_actor,'deny') from av_state$$,'22023',null,'denial requires employee-facing explanation');
select is(pg_temp.av_cmd(manager_actor,'deny','{"reason":"Please discuss the Monday coverage."}')->>'status','denied','manager can deny with explanation') from av_state;
select ok((select capacity_notice_open from public.availability_requests where id=(select request_id from av_last)),'denial does not pretend employee capacity returned');
select throws_ok($$insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
select w,loc,starts,1,owner_actor from av_state$$,'23514',null,'unresolved denied narrowing still blocks publication');
select throws_ok($$select pg_temp.av_cmd(manager_actor,'resolve_notice') from av_state$$,'22023',null,'notice closure requires recorded employee conversation');
select lives_ok($$select pg_temp.av_cmd(manager_actor,'resolve_notice',jsonb_build_object('confirmation',jsonb_build_object('channel','phone','confirmed_at',now(),'note','Employee confirmed the original hours.'))) from av_state$$,'recorded conversation resolves capacity notice');
select is((select count(*)::integer from av_state s cross join lateral public.availability_pending_publication(s.w,s.loc,s.starts)),0,'resolved denial no longer blocks publication');
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=s.emp),1,'resolving a denial preserves the original effective hours') from av_state s;

select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','employee can submit a new narrowing after closure') from av_state;
select is(pg_temp.av_cmd(manager_actor,'approve')->>'status','effective','manager approval activates reported capacity') from av_state;
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=s.emp),2,'approval appends exactly one version') from av_state s;
select throws_ok($$select pg_temp.av_cmd(manager_actor,'approve') from av_state$$,'40001',null,'second approval cannot activate twice');
select throws_ok($$update public.availability_requests set proposal=jsonb_set(proposal,'{timezone}','"Europe/London"') where id=(select request_id from av_last)$$,'23514',null,'proposal evidence is immutable');

update public.workspace_scheduling_settings set availability_approval='none' where workspace_id=(select w from av_state);
update av_state set p=jsonb_set(p,'{days,1}','{"day":1,"mode":"unrestricted","windows":[]}');
select is(pg_temp.av_cmd(manager_actor,'submit')->>'status','awaiting_employee','manager proposal waits for employee even with approval disabled') from av_state;
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=s.emp),2,'manager proposal cannot silently expand capacity') from av_state s;
select throws_ok($$select pg_temp.av_cmd(manager_actor,'confirm') from av_state$$,'42501',null,'manager cannot impersonate employee confirmation');
select is(pg_temp.av_cmd(employee_actor,'confirm')->>'status','effective','employee confirms manager proposal') from av_state;
select is((select confirmation_source from public.employee_schedule_availability_versions where employee_id=s.emp order by version_number desc limit 1),'employee','canonical record distinguishes employee confirmation from manager author') from av_state s;

update public.workspace_scheduling_settings set availability_approval='all' where workspace_id=(select w from av_state);
select is(pg_temp.av_cmd(manager_actor,'submit')->>'status','awaiting_employee','all-review manager proposal still requires employee confirmation first') from av_state;
select is(pg_temp.av_cmd(employee_actor,'confirm')->>'status','pending_review','employee confirmation retains independent review requirement') from av_state;
select throws_ok($$select pg_temp.av_cmd(manager_actor,'approve') from av_state$$,'42501',null,'proposal author cannot review their own record');
select is(pg_temp.av_cmd(owner_actor,'approve')->>'status','effective','another scoped manager can review confirmed proposal') from av_state;

update public.workspace_scheduling_settings set availability_ownership='employee_only' where workspace_id=(select w from av_state);
select throws_ok($$select pg_temp.av_cmd(manager_actor,'submit') from av_state$$,'42501',null,'employee-only policy blocks manager authored availability');
update public.workspace_scheduling_settings set availability_ownership='manager_only',availability_approval='none' where workspace_id=(select w from av_state);
select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','manager-only mode still allows employee correction through review') from av_state;
select is(pg_temp.av_cmd(employee_actor,'withdraw')->>'status','withdrawn','employee can withdraw pending correction') from av_state;
update public.workspace_scheduling_settings set availability_ownership='hybrid' where workspace_id=(select w from av_state);
select throws_ok($$select pg_temp.av_cmd(manager_actor,'submit','{"source":"manager_recorded_confirmation"}') from av_state$$,'22023',null,'recorded confirmation requires evidence');
select is(pg_temp.av_cmd(manager_actor,'submit',jsonb_build_object('source','manager_recorded_confirmation','confirmation',jsonb_build_object('channel','conversation','confirmed_at',now(),'note','Employee confirmed these hours today.')))->>'status','effective','manager records previously confirmed employee hours') from av_state;

-- Stable input plus key survives retries; a changed payload cannot reuse that key.
create temp table av_retry as select gen_random_uuid() key,jsonb_build_object('action','submit','employee_id',s.emp,'expected_revision',v.revision,'proposal',s.p) command
from av_state s cross join lateral (select max(version_number) revision from public.employee_schedule_availability_versions where employee_id=s.emp) v;
select lives_ok($$select public.availability_command_service(s.employee_actor,s.w,r.command,r.key) from av_state s,av_retry r$$,'first idempotent command succeeds');
select lives_ok($$select public.availability_command_service(s.employee_actor,s.w,r.command,r.key) from av_state s,av_retry r$$,'retry returns original result despite changed effective revision');
select is((select count(*)::integer from public.availability_commands c,av_state s,av_retry r where c.workspace_id=s.w and c.idempotency_key=r.key),1,'one command retained for retry');
select throws_ok($$select public.availability_command_service(s.employee_actor,s.w,r.command||'{"extra":"changed"}',r.key) from av_state s,av_retry r$$,'40001',null,'same key cannot describe a different command');
select throws_ok($$select public.save_employee_hub_availability_service(employee_actor,w,'UTC',p->'days') from av_state$$,'40001',null,'legacy Hub entry point cannot bypass lifecycle');
select throws_ok($$select public.save_employee_availability_service(employee_actor,'UTC',p->'days',1) from av_state$$,'40001',null,'legacy onboarding entry point cannot bypass lifecycle');

-- Partial manager scope may read shared capacity, but must not change a global pattern.
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select w,emp,'11000000-0000-4000-8000-000000000002',owner_actor from av_state;
update public.workspace_memberships set all_locations=false where user_id=(select manager_actor from av_state);
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
select s.w,m.id,s.loc from av_state s join public.workspace_memberships m on m.workspace_id=s.w and m.user_id=s.manager_actor;
select ok(not public.availability_actor_scope(manager_actor,w,emp,true),'partial location scope cannot edit global availability') from av_state;
select ok(public.availability_actor_scope(manager_actor,w,emp,false),'shared location can inspect employee availability') from av_state;
select throws_ok($$select pg_temp.av_cmd(manager_actor,'submit') from av_state$$,'42501',null,'command enforces all affected locations');

-- Both publication preview overloads expose a hard, nonoverrideable pending finding.
update public.workspace_scheduling_settings set availability_approval='all' where workspace_id=(select w from av_state);
select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','new pending request for preview coverage') from av_state;
insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by)
select 'ab930000-0000-4000-8000-000000000001',w,starts,'Availability review test',owner_actor,owner_actor from av_state;
select is(public.preview_schedule_publication_service(owner_actor,w,'ab930000-0000-4000-8000-000000000001',array[loc])->>'status','hard_blocked','location publication preview blocks unresolved request') from av_state;
select is(public.preview_schedule_publication_service(owner_actor,w,'ab930000-0000-4000-8000-000000000001',array[loc],null,true)->>'status','hard_blocked','department publication preview uses same period rule') from av_state;
select ok(exists(select 1 from public.notification_outbox n,av_state s where n.workspace_id=s.w and n.type_key='availability.review_required' and n.payload->>'request_id'=(select request_id::text from av_last)),'review event reaches existing transactional notification relay');
select is(pg_temp.av_cmd(employee_actor,'withdraw')->>'status','withdrawn','withdrawal resolves pending publication blocker') from av_state;
select lives_ok($$insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
select w,loc,starts,1,owner_actor from av_state$$,'publication succeeds once pending request is resolved');
select throws_ok($$select pg_temp.av_cmd(employee_actor,'submit') from av_state$$,'23514',null,'employee cannot submit a new request after publication');
select throws_ok($$select pg_temp.av_cmd(owner_actor,'submit') from av_state$$,'23514',null,'manager cannot bypass publication lock');
set local role authenticated;
select throws_ok($$select * from public.availability_requests$$,'42501',null,'raw requests are not exposed through anonymous actor spoofing');
select throws_ok($$select public.availability_command_service(gen_random_uuid(),gen_random_uuid(),'{}',gen_random_uuid())$$,'42501',null,'command boundary is service-only');
reset role;
select lives_ok($$select public.project_notification_event_service(n.id) from public.notification_outbox n,av_state s where n.workspace_id=s.w and n.type_key like 'availability.%'$$,'availability events project through the existing notification platform');
select lives_ok($$select public.project_notification_recipients_service(n.id) from public.notification_outbox n,av_state s where n.workspace_id=s.w and n.type_key like 'availability.%'$$,'notification recipients follow existing membership and channel policy');
select lives_ok($$select public.project_notification_inbox_service(n.id) from public.notification_outbox n,av_state s where n.workspace_id=s.w and n.type_key like 'availability.%'$$,'availability notifications project into the existing inbox');

-- A second employee starts onboarding without an existing canonical baseline.
update av_state set emp='ab910000-0000-4000-8000-000000000002',employee_actor=manager_actor,starts=starts+100,p=jsonb_set(p,'{effective_from}',to_jsonb((starts+100)::text));
delete from av_last;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,employee_actor,'E-992191','Initial','Review',owner_actor from av_state;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,owner_actor from av_state;
update public.workspace_scheduling_settings set availability_initial_review=true,availability_approval='none' where workspace_id=(select w from av_state);
select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','organization can require review of first availability') from av_state;
select is((select count(*)::integer from public.employee_schedule_availability_versions v,av_state s where v.employee_id=s.emp),0,'initial pending report is not effective capacity');
select is(pg_temp.av_cmd(owner_actor,'approve')->>'status','effective','first approved report activates capacity') from av_state;
insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id)
select s.w,s.emp,m.id from av_state s join public.workspace_memberships m on m.workspace_id=s.w and m.user_id=s.employee_actor;
insert into public.employee_onboarding_requirements(workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order)
select s.w,s.emp,c.id,'availability','Availability',true,true,true,30 from av_state s join public.employee_onboarding_cases c on c.employee_id=s.emp;
update public.workspace_scheduling_settings set availability_approval='all' where workspace_id=(select w from av_state);
create temp table av_onboarding_retry as select gen_random_uuid() key,c.revision case_revision,1 availability_revision from public.employee_onboarding_cases c,av_state s where c.employee_id=s.emp;
create temp table av_onboarding_result as select public.save_onboarding_availability_v3_service(s.employee_actor,'UTC',s.p->'days',r.case_revision,s.starts,null,r.availability_revision,r.key) revision from av_state s,av_onboarding_retry r;
select is((select q.status::text from public.employee_onboarding_requirements q,av_state s where q.employee_id=s.emp),'awaiting_review','onboarding shows pending rather than completed availability');
select is(public.save_onboarding_availability_v3_service(s.employee_actor,'UTC',s.p->'days',r.case_revision,s.starts,null,r.availability_revision,r.key),(select revision from av_onboarding_result),'onboarding retry returns the original revision') from av_state s,av_onboarding_retry r;
select throws_ok($$select public.review_employee_onboarding_service(s.owner_actor,s.w,s.emp,'accept_requirement',q.id,'',c.revision,true)
from av_state s join public.employee_onboarding_cases c on c.employee_id=s.emp join public.employee_onboarding_requirements q on q.case_id=c.id$$,'22023',null,'generic onboarding accept cannot bypass capacity review');
select throws_ok($$select public.review_employee_onboarding_service(s.owner_actor,s.w,s.emp,'activate',null,'',c.revision,true)
from av_state s join public.employee_onboarding_cases c on c.employee_id=s.emp$$,'23514',null,'activation waits for onboarding availability decision');
delete from av_last;
insert into av_last select id from public.availability_requests r,av_state s where r.employee_id=s.emp and r.status='pending_review';
select is(pg_temp.av_cmd(owner_actor,'changes_requested','{"reason":"Please clarify your Monday hours."}')->>'status','changes_requested','manager can request an onboarding correction') from av_state;
select is((select q.status::text from public.employee_onboarding_requirements q,av_state s where q.employee_id=s.emp),'rejected','requested correction is visible on onboarding requirement');
select is(pg_temp.av_cmd(employee_actor,'submit',jsonb_build_object('supersedes_request_id',r.id,'supersedes_request_revision',r.revision,'source','onboarding','onboarding_revision',c.revision))->>'status','pending_review','employee replaces a correction request explicitly')
from av_state s join public.availability_requests r on r.id=(select request_id from av_last) join public.employee_onboarding_cases c on c.employee_id=s.emp;
select is(pg_temp.av_cmd(owner_actor,'approve')->>'status','effective','corrected onboarding availability can be approved') from av_state;
select is((select q.status::text from public.employee_onboarding_requirements q,av_state s where q.employee_id=s.emp),'completed','approval completes the same onboarding requirement');
select is((select count(*)::integer from public.employee_availability_versions v,av_state s where v.employee_id=s.emp),1,'pending and replaced onboarding proposals do not duplicate approved snapshots');
select ok(not public.availability_week_capacity('[{"day":0,"mode":"windows","windows":[{"start":"09:00:01","end":"10:00:00"}]}]') @> int4multirange(int4range(32400,32401,'[)')),'capacity comparison does not round away a one-second unavailable boundary');
select ok(public.availability_week_capacity('[{"day":0,"mode":"windows","windows":[{"start":"09:00:01","end":"10:00:00"}]}]') @> int4multirange(int4range(32401,32402,'[)')),'capacity includes the exact available second');
-- The current seeded week is published on a clean reset. Exercise the notice
-- policy in an unpublished week instead of attempting to bypass that lock.
update public.workspace_scheduling_settings set availability_approval='none',availability_notice_days=14 where workspace_id=(select w from av_state);
update av_state set p=p||jsonb_build_object('effective_from',current_date+8,'effective_until',current_date+9,'kind','temporary');
select is(pg_temp.av_cmd(employee_actor,'submit')->>'status','pending_review','short notice requires review even when approval is otherwise disabled') from av_state;
select is(pg_temp.av_cmd(employee_actor,'withdraw')->>'status','withdrawn','short-notice request can be withdrawn without changing effective hours') from av_state;
update public.workspace_scheduling_settings set availability_notice_days=0 where workspace_id=(select w from av_state);
update public.employee_profiles set user_id=null where id=(select emp from av_state);
select is(pg_temp.av_cmd(owner_actor,'submit',jsonb_build_object('source','manager_recorded_confirmation','confirmation',jsonb_build_object('channel','phone','confirmed_at',now(),'note','Unlinked employee confirmed these hours.')))->>'status','effective','manager can record actual confirmation for an employee without an app account') from av_state;
select * from finish();
rollback;
