-- EKRAN-01 #38 (BL-579; KARARLAR Schedule, user decision 2026-10-05): Ali
-- takes a 10:00-14:00 shift on his approved day off, with his own consent
-- (swap or pickup). His leave shortens around it and the rest of the day stays
-- leave, so the Schedule painted the whole cell time-off red. The cell now
-- reads as an ordinary shift: the week's availability says, day by day,
-- whether the employee gave up some of that day's leave for a shift
-- (leave_given_for_shift), and the screen draws no mark in the cell that holds
-- the shift (the flag is about the day: a closing shift's next morning or a
-- shift given away since keeps the red). The leave hours
-- themselves stay in leave_intervals for every warning that reads them.
--
-- The hours given back are the approved time_off_cancellation an approved
-- swap or pickup writes (app_private.shorten_time_off, source
-- 'shift_exchange'); a manager who shortens leave by hand is not consent and
-- keeps the red. Changed on the definition the database holds
-- (pg_get_functiondef); each anchor must be found exactly once.
--
-- Every Schedule read now asks the events of those cancellations for their
-- source; the events had no index but their primary key, so that look-up
-- would read the whole table, every workspace's (review #38 O3).
create index if not exists schedule_time_off_events_request_idx
  on public.schedule_time_off_events (request_id);

do $migration$
declare
  fn constant regprocedure :=
    'app_private.schedule_week_availability(uuid,date,uuid[],uuid[],boolean)'::regprocedure;
  definition text := pg_get_functiondef(fn);
  -- [anchor, replacement] pairs.
  edits constant text[] := array[
    E'), clock_segments as (\n',
    E'), given_for_shift as (\n'
    || E'  -- Leave the employee gave back to take a shift with their own consent.\n'
    || E'  select req.employee_id, lt.zone_name, range_agg(tstzrange(seg.starts_at, seg.ends_at, ''[)'') * lt.span) as spans\n'
    || E'  from leave_target lt\n'
    || E'  join public.schedule_time_off_requests req\n'
    || E'    on req.workspace_id = target_workspace_id and req.employee_id = any(target_employee_ids)\n'
    || E'   and req.request_type = ''time_off_cancellation'' and req.status = ''approved''\n'
    || E'  join public.schedule_time_off_segments seg\n'
    || E'    on seg.request_id = req.id and seg.workspace_id = req.workspace_id and seg.status = ''approved''\n'
    || E'   and seg.segment_date between target_week_start - 4 and target_week_start + 12\n'
    || E'  where tstzrange(seg.starts_at, seg.ends_at, ''[)'') && lt.span\n'
    || E'    and exists (select 1 from public.schedule_time_off_events ev\n'
    || E'      where ev.request_id = req.id and ev.workspace_id = req.workspace_id\n'
    || E'        and ev.metadata -> ''source'' ->> ''source'' = ''shift_exchange'')\n'
    || E'  group by req.employee_id, lt.zone_name\n'
    || E'), clock_segments as (\n',
    E'                 ''all_day'', coalesce(u.spans, ''{}''::tstzmultirange) @> ds.span) order by ds.work_date)\n',
    E'                 ''all_day'', coalesce(u.spans, ''{}''::tstzmultirange) @> ds.span,\n'
    || E'                 ''leave_given_for_shift'', coalesce(g.spans, ''{}''::tstzmultirange) && ds.span) order by ds.work_date)\n',
    E'  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name\n',
    E'  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name\n'
    || E'  left join given_for_shift g on g.employee_id = e.employee_id and g.zone_name = z.zone_name\n'];
  i integer;
begin
  for i in 1 .. array_length(edits, 1) by 2 loop
    if (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]) <> 1 then
      raise exception 'EKRAN-01 #38: schedule_week_availability no longer reads as this expects (anchor %)', (i + 1) / 2;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$migration$;
