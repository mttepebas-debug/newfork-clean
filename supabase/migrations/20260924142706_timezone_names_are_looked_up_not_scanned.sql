-- BL-102: availability, time-off and document code checked a zone name with
-- exists(select 1 from pg_timezone_names where name=...). That view reads every
-- zone file from disk on each call (~33 ms locally for ~1,200 zones), which was
-- about 0.1 s of each assess_weekly_shift_availability call and most of the time
-- of the slowest pgTAP files. A name is now looked up in a snapshot table first.

create table app_private.timezone_names (name text primary key);

comment on table app_private.timezone_names is
  'Snapshot of pg_timezone_names taken by migration 20260924142706; read only through app_private.timezone_name_valid().';

insert into app_private.timezone_names (name)
select name from pg_catalog.pg_timezone_names;

-- Accepts exactly the names pg_timezone_names lists; false, never null, for anything else.
create function app_private.timezone_name_valid(zone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if zone is null then return false; end if;
  if exists (select 1 from app_private.timezone_names where name = zone) then return true; end if;
  -- ponytail: the snapshot is as old as this migration; a zone a later tzdata adds
  -- still passes through the catalog scan below (slow, never wrong). Refresh the
  -- table if that ever shows up in timings.
  return exists (select 1 from pg_catalog.pg_timezone_names where name = zone);
end;
$$;

-- terminate_employee and set_employee_document_timezone_service keep their own
-- scan: they are FOUNDATION-B entry points and change with that work.
-- supabase/tests/timezone_names.test.sql fails if any other function reads
-- pg_timezone_names again.
do $$
declare proc regprocedure; body text;
begin
 foreach proc in array array[
  'public.assess_shift_availability_context(uuid,uuid,jsonb,boolean,jsonb,uuid)'::regprocedure,
  'public.assess_weekly_shift_availability(uuid,uuid,jsonb)'::regprocedure,
  'public.availability_calendar_context(uuid,uuid,uuid,date,text,integer,jsonb)'::regprocedure,
  'app_private.document_employee_timezone(uuid,uuid)'::regprocedure,
  'public.normalize_schedule_time_source(uuid,jsonb,jsonb,boolean)'::regprocedure,
  'public.time_off_resolve_clock(timestamp without time zone,text,text)'::regprocedure,
  'public.time_off_resolve_period(jsonb,text)'::regprocedure,
  'public.validate_availability_week(text,jsonb)'::regprocedure,
  'public.weekly_preference_intersections(uuid,jsonb,tstzrange,text)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  if strpos(body,'pg_timezone_names')=0 then raise exception 'zone check anchor changed: %',proc; end if;
  body:=regexp_replace(body,'exists\(select 1 from (pg_catalog\.)?pg_timezone_names where name=([a-z_]+)\)','app_private.timezone_name_valid(\2)','g');
  if strpos(body,'pg_timezone_names')>0 then raise exception 'zone check left unreplaced: %',proc; end if;
  execute body;
 end loop;
end $$;
