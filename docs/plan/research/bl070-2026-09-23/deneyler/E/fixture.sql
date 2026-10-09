-- Kadikoy/Besiktas fixture (rolled back by caller)
create temp table fx as select
 'e0000000-0000-4000-8000-000000000001'::uuid w,
 'e0000000-0000-4000-8000-000000000002'::uuid owner_id,
 'e0000000-0000-4000-8000-000000000003'::uuid ali_user,
 'e0000000-0000-4000-8000-000000000004'::uuid ali,
 'e0000000-0000-4000-8000-000000000005'::uuid mgr_user,
 'e0000000-0000-4000-8000-000000000006'::uuid kad,
 'e0000000-0000-4000-8000-000000000007'::uuid bes,
 'e0000000-0000-4000-8000-000000000008'::uuid job,
 'e0000000-0000-4000-8000-000000000009'::uuid mgr_emp,
 'e0000000-0000-4000-8000-00000000000a'::uuid pub_bes,
 'e0000000-0000-4000-8000-00000000000b'::uuid mgr2_user,
 '2035-01-15'::date week, null::uuid session;
insert into auth.users(id,email) select owner_id,'fx-owner@example.test' from fx union all select ali_user,'fx-ali@example.test' from fx
 union all select mgr_user,'fx-mgr@example.test' from fx union all select mgr2_user,'fx-mgr2@example.test' from fx;
insert into public.workspaces(id,name,created_by) select w,'FX',owner_id from fx;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from fx
 union all select w,ali_user,'employee'::public.workspace_role,false from fx
 union all select w,mgr_user,'manager'::public.workspace_role,false from fx
 union all select w,mgr2_user,'manager'::public.workspace_role,false from fx;
insert into public.workspace_scheduling_settings(workspace_id) select w from fx on conflict do nothing;
insert into public.locations(short_name,id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'FXKAD',kad,w,'Kadikoy','1 St','Istanbul','IST','34000','Europe/Istanbul' from fx
 union all select 'FXBES',bes,w,'Besiktas','2 St','Istanbul','IST','34001','Europe/Istanbul' from fx;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from fx;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select ali,w,ali_user,'E-990501','Ali','Yilmaz',owner_id from fx
 union all select mgr_emp,w,mgr_user,'E-990502','Mehmet','Manager',owner_id from fx;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,ali,kad,owner_id from fx union all select w,ali,bes,owner_id from fx union all select w,mgr_emp,kad,owner_id from fx;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,ali,job,true,owner_id from fx union all select w,mgr_emp,job,true,owner_id from fx;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select f.w,m.id,f.kad from fx f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in (f.mgr_user,f.ali_user)
 on conflict do nothing;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select f.w,m.id,f.bes from fx f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in (f.mgr2_user,f.ali_user)
 on conflict do nothing;
-- Besiktas publication: Ali Monday 12-16
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pub_bes,w,bes,week,1,owner_id from fx;
insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,source_shift_id)
 select w,bes,pub_bes,ali,job,week,'12:00','16:00','explicit',gen_random_uuid() from fx;
