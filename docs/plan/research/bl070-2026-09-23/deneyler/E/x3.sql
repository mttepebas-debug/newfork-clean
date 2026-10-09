begin;
\i /tmp/fixture.sql
select 'mgr employees', jsonb_array_length(public.get_schedule_read_model_service(mgr_user,w,week)->'employees'), jsonb_pretty(public.get_schedule_read_model_service(mgr_user,w,week)->'employees'->0) from fx;
select 'mgr shifts', jsonb_array_length(public.get_schedule_read_model_service(mgr_user,w,week)->'shifts') from fx;
select 'mgr locations', (select string_agg(x->>'name',',') from jsonb_array_elements(public.get_schedule_read_model_service(mgr_user,w,week)->'locations') x) from fx;
rollback;
