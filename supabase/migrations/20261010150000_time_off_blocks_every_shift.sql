-- BL-995 (KARARLAR §1.1, Mert 2026-10-09): approved time off blocks every shift
-- it overlaps, even by a minute, however the shift is taken. The BL-182 path
-- that let an employee take a shift inside their own approved leave by
-- agreeing that it shortens goes, all of it:
-- * eligibility no longer sets the leave aside for anyone's consent; it is a
--   blocker like the other assessment reasons;
-- * the employee's availability question no longer asks about time off, and
--   the consent each side of an exchange stored is dropped;
-- * a manager's approval of an exchange no longer shortens anybody's leave.
-- Shift Hub still lists an open shift to an employee whose approved time off is
-- the only thing in the way, as not open to them and why (Mert 2026-10-10), so
-- they know to ask for those hours back first (Employee Hub cancellation). A
-- manager shortening leave by hand (shorten_time_off_service) stays.
--
-- Functions change on the definition the database holds (pg_get_functiondef):
-- each anchor must be found as many times as given, or nothing changes.

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'BL-995: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

-- Eligibility: approved time off is one more blocker; nothing shortens.
select pg_temp.patch('app_private.eligibility(uuid,uuid,jsonb,jsonb)', array[
  E' consent jsonb:=ctx->''consent'';\n', '', '1',
  E'tz text; span tstzrange; a jsonb; leave jsonb; settings', E'tz text; span tstzrange; a jsonb; settings', '1',
  E'flags jsonb:=''[]''; shortens boolean:=false; r jsonb;', E'flags jsonb:=''[]''; r jsonb;', '1',
  E'''approvals_required'',jsonb_build_array(loc),''shortens_time_off'',false,\n', E'''approvals_required'',jsonb_build_array(loc),\n', '1',
  E'if r->>''code'' not in (''availability'',''note'',''approved_time_off'') and', E'if r->>''code'' not in (''availability'',''note'') and', '1',
  E' -- Approved time off: only the person''s own consent sets it aside (BL-182), and\n'
  || E' -- only for the hours they agreed to; a cover search never passes consent (D1).\n'
  || E' leave:=public.time_off_leave_intervals(a);\n'
  || E' if jsonb_array_length(leave)>0 then\n'
  || E'  if consent=''true''::jsonb or (jsonb_typeof(consent)=''array''\n'
  || E'   and public.availability_json_ranges(consent) @> public.availability_json_ranges(leave)) then\n'
  || E'   shortens:=true;\n'
  || E'   acks:=acks||jsonb_build_array(jsonb_build_object(''code'',''approved_time_off'',''intervals'',leave));\n'
  || E'  else\n'
  || E'   blockers:=blockers||jsonb_build_array(jsonb_build_object(''code'',''approved_time_off'',''message'',\n'
  || E'    (select x->>''message'' from jsonb_array_elements(a->''reasons'') x where x->>''code''=''approved_time_off'' limit 1)));\n'
  || E'  end if;\n'
  || E' end if;\n',
  E' -- Approved time off is a blocker like the reasons above, even by a minute\n'
  || E' -- and for the person themselves (KARARLAR §1.1, 2026-10-09; BL-995).\n', '1',
  E'  ''shortens_time_off'',shortens,\n', '', '1'
]);

-- The employee's availability question: their availability only.
create or replace function public.weekly_exchange_employee_warning(w uuid, emp uuid, target jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb;
begin
 a:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',target->>'date','_shift_exchange',true));
 -- Anything that blocks, approved time off included, is not theirs to set aside (BL-995).
 if a->>'operation' in ('verification_required','blocked') or jsonb_array_length(a->'employee_intervals')=0 then return null; end if;
 return jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(jsonb_build_object(
  'workspace',w,'employee',emp,'source',target->>'source_id','location',target->>'location_id',
  'intervals',a->'intervals','conflicts',a->'employee_intervals')::text,'UTF8'),'sha256'),'hex'));
end; $$;

-- The exchange's commands: no consent asked, stored or spent.
select pg_temp.patch('public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)', array[
  E'manager boolean; consent jsonb:=''[]'';', E'manager boolean;', '1',
  E'    consent:=public.weekly_exchange_time_off_consent(w,emp.id,t);\n', '', '1',
  E'jsonb_build_object(''operation'',''swap'',''consent'',consent,''excluded'',jsonb_build_array(s->>''id'',t->>''id'')))->>''status''<>''eligible'' then raise exception ''You are not eligible for the teammate shift''',
  E'jsonb_build_object(''operation'',''swap'',''excluded'',jsonb_build_array(s->>''id'',t->>''id'')))->>''status''<>''eligible'' then raise exception ''You are not eligible for the teammate shift''', '1',
  E',private_note,created_by,owner_time_off_consent)', E',private_note,created_by)', '1',
  E'coalesce(command->>''note'',''''),actor,consent) returning', E'coalesce(command->>''note'',''''),actor) returning', '1',
  E'consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);\n', '', '2',
  E'else ''release_pickup'' end,''consent'',consent))->>''status''', E'else ''release_pickup'' end))->>''status''', '1',
  E'consent_fingerprint,time_off_consent) values(w,cid,emp.id,''pending_manager'',c.consent_fingerprint,consent)',
  E'consent_fingerprint) values(w,cid,emp.id,''pending_manager'',c.consent_fingerprint)', '1',
  E'else ''release_pickup'' end,''consent'',consent,''excluded'',', E'else ''release_pickup'' end,''excluded'',', '1',
  E'''consent'',c.owner_time_off_consent,', '', '1',
  E'     time_off_consent=case when action=''accept'' then consent else time_off_consent end,updated_at=now() where id=aid;',
  E'     updated_at=now() where id=aid;', '1',
  E'      -- BL-182, KK-19: the approved time off each side agreed to give up ends\n'
  || E'      -- now, at the manager''s approval, never at the application.\n'
  || E'      if (checked->''receiver''->>''shortens_time_off'')::boolean then\n'
  || E'       perform app_private.shorten_time_off(actor,w,a.employee_id,tstzmultirange(tstzrange((s->>''starts_at'')::timestamptz,(s->>''ends_at'')::timestamptz,''[)'')),\n'
  || E'        ''Shortened for a shift they took through Shift Hub.'',jsonb_build_object(''source'',''shift_exchange'',''case_id'',cid,''application_id'',aid));\n'
  || E'      end if;\n'
  || E'      if c.kind=''swap'' and (checked->''giver''->>''shortens_time_off'')::boolean then\n'
  || E'       perform app_private.shorten_time_off(actor,w,c.owner_id,tstzmultirange(tstzrange((t->>''starts_at'')::timestamptz,(t->>''ends_at'')::timestamptz,''[)'')),\n'
  || E'        ''Shortened for a shift they took through Shift Hub.'',jsonb_build_object(''source'',''shift_exchange'',''case_id'',cid,''application_id'',aid));\n'
  || E'      end if;\n', '', '1'
]);

select pg_temp.patch('public.shift_exchange_preview(uuid,uuid,uuid,uuid)', array[
  E'''consent'',a.time_off_consent,', '', '1',
  E'''consent'',c.owner_time_off_consent,', '', '1'
]);

select pg_temp.patch('app_private.shift_exchange_case_item(uuid,uuid,public.shift_exchange_cases,boolean,uuid,jsonb,jsonb,text)', array[
  E'''consent'',case when a.employee_id=emp_id and a.status=''invited'' then ''true''::jsonb else a.time_off_consent end,', '', '1'
]);

select pg_temp.patch('public.shift_exchanges_candidates_service(uuid,uuid,uuid)', array[
  E'jsonb_build_object(''operation'',''swap'',''consent'',true,''excluded''', E'jsonb_build_object(''operation'',''swap'',''excluded''', '1'
]);

-- Shift Hub: an open shift whose one obstacle is the person's approved time
-- off is listed as not open to them, with the reason (Mert 2026-10-10).
select pg_temp.patch('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)', array[
  E'else ''release_pickup'' end,''consent'',true))-''approval_flags'')', E'else ''release_pickup'' end))-''approval_flags'')', '1',
  E'   if chk->>''status''=''eligible'' and (c.id is null',
  E'   if (chk->>''status''=''eligible'' or (chk->>''status''=''ineligible'' and not exists(select 1 from jsonb_array_elements(chk->''blockers'') b\n'
  || E'     where b->>''code''<>''approved_time_off''))) and (c.id is null', '1'
]);

-- Only a manager shortens leave now; the employee always hears about it.
select pg_temp.patch('public.notify_time_off_shortened(uuid,uuid,uuid,tstzmultirange,text,jsonb)', array[
  E'\n by_manager boolean:=coalesce(source->>''source'','''')=''manager'';', '', '1',
  E'lines || case when by_manager then '' is no longer time off.'' else '' — they took a shift in these hours.'' end', E'lines || '' is no longer time off.''', '1',
  E' -- The employee agreed in Shift Hub themselves; a manager''s shortening is news to them.\n if by_manager and employee_user is not null',
  E' -- A manager''s shortening is news to the employee.\n if employee_user is not null', '1'
]);

-- The employee's way back (asking to cancel those hours) is now the only way,
-- so its notices must check out: an approved cancellation also writes on the
-- leave it shortens, and that event sends nothing on purpose (R2-13, the
-- notice trigger's own rule); the platform check counted it as missing.
select pg_temp.patch('public.reconcile_notification_platform_service()', array[
  E'      and not public.time_off_event_is_shortening(event.workspace_id, event.request_id, event.metadata)\n',
  E'      and not public.time_off_event_is_shortening(event.workspace_id, event.request_id, event.metadata)\n'
  || E'      -- One decision tells each person once (R2-13), as the notice trigger does.\n'
  || E'      and not (event.metadata ? ''cancelled_intervals'' or (event.action = ''revoked'' and event.metadata ? ''parent_request_id''))\n', '1'
]);

drop function public.weekly_exchange_time_off_consent(uuid, uuid, jsonb);
alter table public.shift_exchange_cases drop column owner_time_off_consent;
alter table public.shift_exchange_applications drop column time_off_consent;
