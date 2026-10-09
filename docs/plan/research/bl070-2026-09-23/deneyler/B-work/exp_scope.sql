-- users: 1 owner, 2 Ali (mgr Kadikoy), 3 Mehmet (mgr Besiktas), 4 Ayse (Kadikoy+Besiktas), 5 Zeynep (no location, excluded), 6 Can (Besiktas only)
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('e1000000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','scope-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,6) n;
insert into public.workspaces(id,name,created_by) values('e2000000-0000-4000-8000-000000000001','Scope WS','e1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,status) values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner','active'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','manager','active'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','manager','active'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','employee','pending_activation'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','employee','pending_activation'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','employee','pending_activation');
insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Kadikoy','KDK','1','Ist','34','34000','TR','Europe/Istanbul'),
 ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','Besiktas','BJK','2','Ist','34','34000','TR','Europe/Istanbul');
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by,is_excluded_from_schedule) values
 ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','E-0002','Ali','M','','scope-2@example.test','e1000000-0000-4000-8000-000000000001',false),
 ('e4000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','E-0003','Mehmet','M','','scope-3@example.test','e1000000-0000-4000-8000-000000000001',false),
 ('e4000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','E-0004','Ayse','E','','scope-4@example.test','e1000000-0000-4000-8000-000000000001',false),
 ('e4000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','E-0005','Zeynep','E','','scope-5@example.test','e1000000-0000-4000-8000-000000000002',true),
 ('e4000000-0000-4000-8000-000000000006','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','E-0006','Can','E','','scope-6@example.test','e1000000-0000-4000-8000-000000000001',false);
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values
 ('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001',true,'e1000000-0000-4000-8000-000000000001'),
 ('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000002',true,'e1000000-0000-4000-8000-000000000001'),
 ('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000001',true,'e1000000-0000-4000-8000-000000000001'),
 ('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000002',false,'e1000000-0000-4000-8000-000000000001'),
 ('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','e3000000-0000-4000-8000-000000000002',true,'e1000000-0000-4000-8000-000000000001');
select public.initialize_employee_onboarding_service(u) from unnest(array['e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000006']::uuid[]) u;
set constraints bl051_sync_membership_scope, bl051_sync_employee_scope, bl051_sync_assignment_scope immediate;
select 'access', a.fn, e.fn, public.service_actor_can_access_employee(a.u,'e2000000-0000-4000-8000-000000000001',e.id)
from (values('Ali','e1000000-0000-4000-8000-000000000002'::uuid),('Mehmet','e1000000-0000-4000-8000-000000000003'::uuid)) a(fn,u)
cross join (values('Ayse(K+B)','e4000000-0000-4000-8000-000000000004'::uuid),('Zeynep(none,excluded,created by Ali)','e4000000-0000-4000-8000-000000000005'::uuid),('Can(B)','e4000000-0000-4000-8000-000000000006'::uuid)) e(fn,id) order by 2,3;
do $$ declare r jsonb; begin r:=public.get_employee_onboarding_review_service('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004'); raise notice 'Ali opens Ayse onboarding review: case_status=%', r->>'case_status'; exception when others then raise notice 'Ali->Ayse review FAILED % %',sqlstate,sqlerrm; end $$;
do $$ declare r jsonb; begin r:=public.get_employee_onboarding_review_service('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000005'); raise notice 'Ali opens Zeynep: %', r->>'case_status'; exception when others then raise notice 'Ali->Zeynep review FAILED % %',sqlstate,sqlerrm; end $$;
