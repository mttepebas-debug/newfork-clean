select pg_temp.pub(ali,kad,5,'18:00','22:00',7) from fx;
create temp table st(k text primary key, v jsonb);
insert into st select 'c', pg_temp.cmd(ali_u,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.sid(7),'employee_id',ayse)) from fx;
select 'R0 accept (no availability conflict yet)', pg_temp.cmd(ayse_u,jsonb_build_object('action','accept','case_id',c.id,'application_id',a.id,'expected_revision',c.revision))->>'status' from fx, public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id=c.id where c.id=(select (v->>'case_id')::uuid from st);
-- Ayse marks Sunday..Saturday 06:00-12:00 unavailable (morning only)
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,ayse,jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',n,'range',jsonb_build_object('start','06:00','end','12:00'),'all_day',false,'shift_type_ids','[]'::jsonb)) from generate_series(0,6) n)),1,ayse_u from fx;
-- manager moves the shift to the morning at Besiktas
update public.schedule_published_shifts set start_time='07:00',end_time='11:00',location_id=(select bes from fx),publication_id=(select pub_b from fx) where id=pg_temp.sid(7);
set constraints weekly_exchange_shift_terms_changed,weekly_exchange_publication_terms_changed immediate;
select 'R1 application status after move', a.status, c.revision from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id=c.id where c.id=(select (v->>'case_id')::uuid from st);
select 'R1 Ayse now has own-availability warning for new time', public.weekly_exchange_employee_warning(w,ayse,public.shift_exchange_shift(w,pg_temp.sid(7))) is not null from fx;
select 'R2 MB (new location mgr) approves', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','approve','case_id',%L,'application_id',%L,'expected_revision',%s,'fingerprint',%L))->>'status'$q$,mb_u,c.id,a.id,c.revision,public.shift_exchange_preview(mb_u,w,c.id,a.id)->>'fingerprint')) from fx, public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id=c.id where c.id=(select (v->>'case_id')::uuid from st);
select 'R2 recorded consent', reason from public.schedule_availability_overrides where shift_id=pg_temp.sid(507) and revoked_at is null;
