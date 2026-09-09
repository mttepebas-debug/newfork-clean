-- A user can enter four unavailable intervals. Their complement may contain
-- five available pieces; persist the same canonical positive-hour model.
do $range_limit$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.validate_availability_week(text,jsonb)'::regprocedure);
 anchor:='jsonb_array_length(d->''windows'')>4';
 if position(anchor in body)=0 then raise exception 'Availability interval limit changed'; end if;
 execute replace(body,anchor,'jsonb_array_length(d->''windows'')>5');
 body:=pg_get_functiondef('public.availability_read_service(uuid,uuid,uuid)'::regprocedure);
 anchor:='''published_periods'',locks,';
 if position(anchor in body)=0 then raise exception 'Availability read projection changed'; end if;
 body:=replace(body,anchor,$fragment$
  'clock_presets',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
   'start_time',to_char(s.default_start_time,'HH24:MI'),'end_time',to_char(s.default_end_time,'HH24:MI')) order by s.name,s.id),'[]')
   from public.shift_types s where s.workspace_id=w and s.archived_at is null
    and s.default_start_time is not null and s.default_end_time is not null and s.default_start_time<>s.default_end_time),
  'published_periods',locks,$fragment$);
 execute body;
end; $range_limit$;
