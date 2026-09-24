begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table aq as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid owner,
 'af9f0000-0000-4000-8000-000000000001'::uuid a,'af9f0000-0000-4000-8000-000000000002'::uuid b,
 'af9f0000-0000-4000-8000-000000000003'::uuid manager,'af9f0000-0000-4000-8000-000000000004'::uuid employee;
select public.availability_lock_workspace(w) from aq;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select 'T00005', a,w,'Queue 23001 A','1 QA','QA','CA','94301','US','UTC' from aq union all select 'T00006', b,w,'Queue 23001 Hidden B','1 QA','QA','CA','94301','US','UTC' from aq;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@queue.test','','{}','{}',now(),now() from aq cross join lateral (values(manager),(employee)) x(id);
insert into public.workspace_roles(id,workspace_id,name,access_class) select 'af9f0000-0000-4000-8000-000000000005',w,'Queue scoped reviewer','manager' from aq;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'af9f0000-0000-4000-8000-000000000005',p from aq,unnest(array['workspace.read','employees.read','employees.manage']) p;
insert into public.workspace_memberships(id,workspace_id,user_id,role,role_id,status,all_locations)
select 'af9f0000-0000-4000-8000-000000000006',w,manager,'manager','af9f0000-0000-4000-8000-000000000005','active',false from aq;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,employee,'employee','active',true from aq;
create temp table aq_employees as select n,('af9f1000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id from generate_series(1,5) n;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select e.id,w,case when n=1 then employee when n=5 then manager else null end,'E-99530'||n,'Queue 23001','Person '||n,owner from aq,aq_employees e;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select w,id,a,owner from aq,aq_employees where n in (1,2,5) union all select w,id,b,owner from aq,aq_employees where n in (2,3);
create temp table aq_requests as select n,('af9f2000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id,
 ('af9f1000-0000-4000-8000-'||lpad((case when n<=5 then n else 1 end)::text,12,'0'))::uuid emp,
 case when n<=5 then 'pending_review' when n=6 then 'awaiting_employee' when n in (7,13) then 'changes_requested'
 when n in (8,9) then 'denied' when n=10 then 'effective' when n=11 then 'withdrawn' else 'superseded' end status,
 n in (8,13) notice from generate_series(1,13) n;
insert into public.availability_requests(id,workspace_id,employee_id,author_id,proposal,base_revision,policy_revision,policy_snapshot,source,kind,effective_from,is_narrowing,status,capacity_notice_open,created_at)
select r.id,w,r.emp,owner,jsonb_build_object('timezone','UTC','effective_from','2038-01-04','effective_until',null,'days',
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d)),0,1,'{}',
 case when n=6 then 'manager_proposal' else 'employee' end,'weekly','2038-01-04',notice,status,notice,'2030-01-01 12:00Z' from aq,aq_requests r;
create function pg_temp.aq_read(who uuid,extra jsonb default '{}') returns jsonb language sql as $$
 select public.availability_requests_read_service(who,w,'{"search":"Queue 23001"}'::jsonb||extra) from aq;
$$;
select is((pg_temp.aq_read(owner)->>'needs_review_count')::integer,7,'global reader sees all fixture requests needing a decision') from aq;
select is((pg_temp.aq_read(manager)->>'needs_review_count')::integer,5,'scoped reader sees shared and own employees without hidden-only staff') from aq;
select is((pg_temp.aq_read(manager)->>'waiting_employee_count')::integer,2,'employee confirmation and correction remain separate from manager actions') from aq;
select is((pg_temp.aq_read(manager)->>'history_count')::integer,4,'closed requests without capacity notices stay in history') from aq;
select is((select r->>'queue' from aq,jsonb_array_elements(pg_temp.aq_read(manager)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000008'),'needs_review','denied request with unresolved capacity notice remains actionable');
select is((select r->>'can_review' from aq,jsonb_array_elements(pg_temp.aq_read(manager)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000001'),'true','manager with all employee locations may review another author');
select is((select r->>'review_blocker' from aq,jsonb_array_elements(pg_temp.aq_read(manager)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000002'),'location_scope','shared employee explicitly needs a reviewer covering all locations');
select is((select jsonb_array_length(r->'locations') from aq,jsonb_array_elements(pg_temp.aq_read(manager)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000002'),1,'shared employee summary omits hidden location identity');
select ok(position('Queue 23001 Hidden B' in pg_temp.aq_read(manager)::text)=0,'queue counts and labels do not leak hidden locations') from aq;
select is((select r->>'review_blocker' from aq,jsonb_array_elements(pg_temp.aq_read(manager)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000005'),'self_review','manager cannot review their own employee availability');
select is((select r->>'review_blocker' from aq,jsonb_array_elements(pg_temp.aq_read(owner)->'requests') r where r->>'id'='af9f2000-0000-4000-8000-000000000001'),'author_review','author cannot review the request they created');
select is(pg_temp.aq_read(manager,'{"request_id":"af9f2000-0000-4000-8000-000000000010","search":"does not match"}')->'selected'->>'status','effective','direct request link resolves visible history independently of queue/search filters') from aq;
select is(pg_temp.aq_read(manager,'{"request_id":"af9f2000-0000-4000-8000-000000000003"}')->'selected','null'::jsonb,'deep link never exposes a hidden employee request') from aq;
select is(pg_temp.aq_read(manager,jsonb_build_object('request_id',gen_random_uuid()))->'selected','null'::jsonb,'missing request does not fall back to another employee') from aq;
select throws_ok($$select pg_temp.aq_read(employee) from aq$$,'42501',null,'employee self access cannot enumerate manager queues');
select throws_ok($$select public.availability_requests_read_service(owner,gen_random_uuid()) from aq$$,'42501',null,'foreign workspace access denied');
select throws_ok($$select pg_temp.aq_read(manager,jsonb_build_object('location_id',b)) from aq$$,'42501',null,'hidden location filter denied');
select throws_ok($$select pg_temp.aq_read(owner,jsonb_build_object('location_id',gen_random_uuid())) from aq$$,'42501',null,'unknown location cannot impersonate an accessible filter');
select throws_ok($$select pg_temp.aq_read(manager,'{"cursor":"broken"}') from aq$$,'22023',null,'malformed cursor rejected');
select throws_ok($$select pg_temp.aq_read(manager,'{"limit":101}') from aq$$,'22023',null,'oversized page rejected');
select throws_ok($$select pg_temp.aq_read(manager,'{"queue":"all"}') from aq$$,'22023',null,'invalid queue rejected');
select is((pg_temp.aq_read(manager,'{"search":"%"}')->>'needs_review_count')::integer,0,'search treats SQL wildcard characters literally') from aq;
create temp table aq_pages(payload jsonb);
insert into aq_pages select pg_temp.aq_read(manager,'{"limit":2}') from aq;
select is(jsonb_array_length(payload->'requests'),2,'bounded first page') from aq_pages;
select ok(payload->>'next_cursor' is not null,'extra row yields a continuation cursor') from aq_pages;
insert into aq_pages select pg_temp.aq_read(manager,jsonb_build_object('limit',2,'cursor',(select payload->>'next_cursor' from aq_pages limit 1))) from aq;
insert into aq_pages select pg_temp.aq_read(manager,jsonb_build_object('limit',2,'cursor',(select payload->>'next_cursor' from aq_pages offset 1 limit 1))) from aq;
select is((select count(distinct r->>'id')::integer from aq_pages,jsonb_array_elements(payload->'requests') r),5,'equal timestamps paginate all visible requests without duplicates');
select is((select payload->>'next_cursor' from aq_pages offset 2 limit 1),null::text,'last page terminates');
select is((select jsonb_array_length(payload->'requests') from aq_pages offset 2 limit 1),1,'last page contains only remaining row');
select ok(not has_function_privilege('authenticated','public.availability_requests_read_service(uuid,uuid,jsonb)','execute'),'queue RPC remains service-only');
select lives_ok($$select public.availability_notify(r,aq.employee,gen_random_uuid(),'submit') from public.availability_requests r,aq where r.id='af9f2000-0000-4000-8000-000000000001'$$,'review notification uses the versioned queue destination');
select is((select schema_version from public.notification_outbox where subject_id='af9f2000-0000-4000-8000-000000000001' and type_key='availability.review_required'),2,'new manager notification uses schema v2');
select is((select payload->>'action_url' from public.notification_outbox where subject_id='af9f2000-0000-4000-8000-000000000001' and type_key='availability.review_required'),'/app/schedule/requests?tab=availability&request=af9f2000-0000-4000-8000-000000000001','notification points to the exact reviewed request');
select is((select action_route_contract->>'route' from public.notification_catalog where type_key='availability.review_required' and schema_version=1),'/app/employees','previous notification route contract is preserved');
select lives_ok($$select public.project_notification_event_service(id) from public.notification_outbox where subject_id='af9f2000-0000-4000-8000-000000000001'$$,'v2 queue notification passes event projection');
select lives_ok($$select public.project_notification_recipients_service(id) from public.notification_outbox where subject_id='af9f2000-0000-4000-8000-000000000001'$$,'v2 queue notification resolves authorized recipients');
select lives_ok($$select public.project_notification_inbox_service(id) from public.notification_outbox where subject_id='af9f2000-0000-4000-8000-000000000001'$$,'v2 queue notification projects into the inbox');
select is((select count(*)::integer from public.notification_inbox_items i join public.notification_recipients p on p.id=i.recipient_projection_id,aq
 where p.recipient_user_id=aq.manager and i.visibility_state='visible' and i.action_url='/app/schedule/requests?tab=availability&request=af9f2000-0000-4000-8000-000000000001'),1,'scoped manager receives one exact-request inbox link');
select * from finish();
rollback;
