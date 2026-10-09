select pg_temp.pub(ali,kad,5,'18:00','22:00',7), pg_temp.pub(ali,kad,6,'18:00','22:00',10), pg_temp.pub(null,kad,4,'10:00','14:00',9) from fx;
create function pg_temp.allday() returns jsonb language sql as $$ select jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',n,'range',null,'all_day',true,'shift_type_ids','[]'::jsonb)) from generate_series(0,6) n)) $$;
-- Ayse marks herself unavailable every day; Mehmet... use owner_e as manager-reminder subject
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by) select w,ayse,pg_temp.allday(),1,ayse_u from fx;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by) select w,mk_e,pg_temp.allday(),1,owner_u from fx;
select 'A1 Ayse (self-unavailable) check for Kadikoy S7', public.weekly_exchange_candidate_check(w,ayse,public.shift_exchange_shift(w,pg_temp.sid(7))) from fx;
select 'A1 Ayse employee warning', public.weekly_exchange_employee_warning(w,ayse,public.shift_exchange_shift(w,pg_temp.sid(7))) is not null from fx;
select 'A2 Kemal (manager reminder unavailable) check', public.weekly_exchange_candidate_check(w,mk_e,public.shift_exchange_shift(w,pg_temp.sid(7))) from fx;
select 'A2 Kemal employee warning', public.weekly_exchange_employee_warning(w,mk_e,public.shift_exchange_shift(w,pg_temp.sid(7))) is not null from fx;
-- direct cover to Ayse: accept without and with availability fingerprint
create temp table st(k text primary key, v jsonb);
insert into st select 'c', pg_temp.cmd(ali_u,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.sid(7),'employee_id',ayse)) from fx;
select 'A3 Ayse accepts direct cover without ack', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','accept','case_id',%L,'application_id',(select id from public.shift_exchange_applications where case_id=%L),'expected_revision',1))::text$q$,ayse_u,(select v->>'case_id' from st where k='c'),(select v->>'case_id' from st where k='c'))) from fx;
select 'A3 Ayse accepts direct cover WITH ack', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','accept','case_id',%L,'application_id',(select id from public.shift_exchange_applications where case_id=%L),'expected_revision',1,'availability_fingerprint',%L))::text$q$,ayse_u,(select v->>'case_id' from st where k='c'),(select v->>'case_id' from st where k='c'),(select public.weekly_exchange_employee_warning(w,ayse,public.shift_exchange_shift(w,pg_temp.sid(7)))->>'fingerprint' from fx))) from fx;
select 'A3 MK preview allowed + receiver reasons shown to manager', p->>'allowed', p->'receiver' from fx, public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id=c.id, lateral (select public.shift_exchange_preview(mk_u,w,c.id,a.id) p) q where c.id=(select (v->>'case_id')::uuid from st where k='c');
select 'A3 MK approve', pg_temp.cmd(mk_u,jsonb_build_object('action','approve','case_id',c.id,'application_id',a.id,'expected_revision',c.revision,'fingerprint',public.shift_exchange_preview(mk_u,w,c.id,a.id)->>'fingerprint'))->>'status' from fx, public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id=c.id where c.id=(select (v->>'case_id')::uuid from st where k='c');
select 'A3 override recorded', reason, assessment->>'consent_source' from public.schedule_availability_overrides where shift_id=pg_temp.sid(507) and revoked_at is null;
-- Kemal (manager-reminder unavailable) picks up open shift S9 without any ack
select 'A4 Kemal applies to open S9 (manager reminder says unavailable)', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','apply','shift_id',%L))::text$q$,mk_u,pg_temp.sid(9))) from fx;
-- policy block
update public.workspace_scheduling_settings set conflict_rules=conflict_rules||'{"availability":"block"}' where workspace_id=(select w from fx);
select 'A5 availability=block: Ayse check for S10', public.weekly_exchange_candidate_check(w,ayse,public.shift_exchange_shift(w,pg_temp.sid(10))) from fx;
