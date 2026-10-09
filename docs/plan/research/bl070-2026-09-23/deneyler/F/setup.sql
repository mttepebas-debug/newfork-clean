-- F-takas-talepler experiment fixture (always rolled back)
create temp table fx as select
 'f7a00000-0000-4000-8000-000000000001'::uuid w,
 'f7a00000-0000-4000-8000-000000000002'::uuid owner_u,
 'f7a00000-0000-4000-8000-000000000003'::uuid ali_u,
 'f7a00000-0000-4000-8000-000000000004'::uuid ayse_u,
 'f7a00000-0000-4000-8000-000000000005'::uuid mehmet_u,
 'f7a00000-0000-4000-8000-000000000006'::uuid mk_u,
 'f7a00000-0000-4000-8000-000000000007'::uuid mb_u,
 'f7a00000-0000-4000-8000-000000000011'::uuid owner_e,
 'f7a00000-0000-4000-8000-000000000013'::uuid ali,
 'f7a00000-0000-4000-8000-000000000014'::uuid ayse,
 'f7a00000-0000-4000-8000-000000000015'::uuid mehmet,
 'f7a00000-0000-4000-8000-000000000016'::uuid mk_e,
 'f7a00000-0000-4000-8000-000000000021'::uuid kad,
 'f7a00000-0000-4000-8000-000000000022'::uuid bes,
 'f7a00000-0000-4000-8000-000000000031'::uuid server,
 'f7a00000-0000-4000-8000-000000000032'::uuid bartender,
 'f7a00000-0000-4000-8000-000000000041'::uuid pub_k,
 'f7a00000-0000-4000-8000-000000000042'::uuid pub_b,
 (date_trunc('week',current_date)::date+14) d0;
insert into auth.users(id,email) select owner_u,'fx-owner@example.test' from fx union all select ali_u,'fx-ali@example.test' from fx
 union all select ayse_u,'fx-ayse@example.test' from fx union all select mehmet_u,'fx-mehmet@example.test' from fx
 union all select mk_u,'fx-mk@example.test' from fx union all select mb_u,'fx-mb@example.test' from fx;
insert into public.workspaces(id,name,created_by,shift_exchanges_enabled) select w,'FX exchange lab',owner_u,true from fx;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_u,'owner'::public.workspace_role,true from fx
 union all select w,ali_u,'employee'::public.workspace_role,true from fx
 union all select w,ayse_u,'employee'::public.workspace_role,true from fx
 union all select w,mehmet_u,'employee'::public.workspace_role,true from fx
 union all select w,mk_u,'manager'::public.workspace_role,false from fx
 union all select w,mb_u,'manager'::public.workspace_role,false from fx;
insert into public.workspace_scheduling_settings(workspace_id) select w from fx on conflict do nothing;
insert into public.locations(short_name,id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'FXK01',kad,w,'Kadikoy','1 St','Istanbul','IS','34000','UTC' from fx union all select 'FXB01',bes,w,'Besiktas','2 St','Istanbul','IS','34001','UTC' from fx;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select w,m.id,case when m.user_id=mk_u then kad else bes end from fx join public.workspace_memberships m on m.workspace_id=w and m.user_id in(mk_u,mb_u);
insert into public.jobs(id,workspace_id,name) select server,w,'Server' from fx union all select bartender,w,'Bartender' from fx;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select owner_e,w,owner_u,'E-9977010','Olga','Owner',owner_u from fx
 union all select ali,w,ali_u,'E-9977011','Ali','Yilmaz',owner_u from fx
 union all select ayse,w,ayse_u,'E-9977012','Ayse','Kaya',owner_u from fx
 union all select mehmet,w,mehmet_u,'E-9977013','Mehmet','Demir',owner_u from fx
 union all select mk_e,w,mk_u,'E-9977014','Kemal','Manager',owner_u from fx;
-- Ali, Ayse, owner, mk: both locations; Mehmet: Besiktas only
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by,assigned_at)
 select w,e,l,owner_u,now()-interval '30 days' from fx cross join lateral unnest(array[owner_e,ali,ayse,mk_e]) e cross join lateral unnest(array[kad,bes]) l
 union all select w,mehmet,bes,owner_u,now()-interval '30 days' from fx;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by,assigned_at)
 select w,e,server,true,owner_u,now()-interval '30 days' from fx cross join lateral unnest(array[owner_e,ali,ayse,mehmet,mk_e]) e;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pub_k,w,kad,d0,1,owner_u from fx union all select pub_b,w,bes,d0,1,owner_u from fx;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$ select ('f7a00000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid $$;
create function pg_temp.pub(emp uuid,loc uuid,dayoff integer,st time,en time,n integer) returns uuid language sql as $$
 insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.sid(n),pg_temp.sid(n+500),w,loc,case when loc=kad then pub_k else pub_b end,emp,server,d0+dayoff,st,en,'explicit','UTC' from fx returning id $$;
create function pg_temp.cmd(actor uuid,c jsonb) returns jsonb language sql as $$ select public.shift_exchanges_command_service(actor,w,c,gen_random_uuid()) from fx $$;
create function pg_temp.try(q text) returns text language plpgsql as $$ declare r text; begin execute q into r; return coalesce(r,'<null>'); exception when others then return 'ERR '||sqlstate||': '||sqlerrm; end $$;
