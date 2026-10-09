select pg_temp.pub(ali,kad,1,'18:00','22:00',1), pg_temp.pub(ayse,bes,1,'18:00','22:00',2),
       pg_temp.pub(ali,kad,2,'10:00','14:00',3), pg_temp.pub(ayse,bes,3,'10:00','14:00',4),
       pg_temp.pub(ali,kad,4,'12:00','16:00',5), pg_temp.pub(ayse,bes,4,'16:15','20:00',6),
       pg_temp.pub(ali,kad,5,'18:00','22:00',7), pg_temp.pub(mk_e,kad,6,'18:00','22:00',8) from fx;
select 'E1 candidates for Ali S1 (swap list contains S2?)', (select jsonb_path_query_array(public.shift_exchanges_candidates_service(ali_u,w,pg_temp.sid(1)),'$.shifts[*].id')) from fx;
select 'E1 check: Ali takes S2 excluding S1+S2', public.weekly_exchange_candidate_check(w,ali,public.shift_exchange_shift(w,pg_temp.sid(2)),array[pg_temp.sid(1),pg_temp.sid(2)]) from fx;
select 'E1 create swap S1<->S2', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','create','kind','swap','shift_id',%L,'requested_shift_id',%L))::text$q$,ali_u,pg_temp.sid(1),pg_temp.sid(2))) from fx;
select 'E2 create swap S3<->S4 (different days)', pg_temp.try(format($q$select pg_temp.cmd(%L,jsonb_build_object('action','create','kind','swap','shift_id',%L,'requested_shift_id',%L))::text$q$,ali_u,pg_temp.sid(3),pg_temp.sid(4))) from fx;
update public.workspace_scheduling_settings set minimum_travel_minutes=30 where workspace_id=(select w from fx);
select 'E3 check: Ali takes S6 (B 16:15) giving S5 (K ends 16:00), travel 30', public.weekly_exchange_candidate_check(w,ali,public.shift_exchange_shift(w,pg_temp.sid(6)),array[pg_temp.sid(5),pg_temp.sid(6)]) from fx;
update public.workspace_scheduling_settings set minimum_travel_minutes=0 where workspace_id=(select w from fx);
select 'E5 Mehmet (Besiktas only) for Kadikoy S7', public.weekly_exchange_candidate_check(w,mehmet,public.shift_exchange_shift(w,pg_temp.sid(7))) from fx;
