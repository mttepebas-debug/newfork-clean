-- BL-1043: a time-off write refused with PT409 now says which kind of refusal
-- in its hint, the machine key the API passes on as `reason`. One code used to
-- mean both "this request changed meanwhile, look again" and a standing "this
-- cannot happen", so every screen read any 409 as "changed". Only the hints are
-- added; every sentence, code and check stays as it was (the BL-1028 method).
--   time_off.changed               the request, its approved leave or the shifts it affects moved on: look again
--   time_off.not_decided_in_time   the decision deadline has passed; nothing to look again at
--   time_off.request_reused        a request key replayed with other content
--   time_off.timezone_changed      the hours were drawn in a zone the location no longer has
--
-- The functions change on the definitions the database holds
-- (pg_get_functiondef): each anchor must be found exactly as often as
-- expected, or nothing changes.

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
      raise exception 'time-off refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('app_private.time_off_finalize(uuid,uuid,text,uuid,text,boolean,boolean)', array[
  '''This request is already closed'' using errcode = ''PT409''',
  '''This request is already closed'' using errcode = ''PT409'', hint = ''time_off.changed''', '1',
  '''The time off this cancellation is about has changed; refresh'' using errcode = ''PT409''',
  '''The time off this cancellation is about has changed; refresh'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('app_private.time_off_release_shifts(uuid,uuid,uuid,integer,uuid)', array[
  '''A published shift changed before it could be opened; try again'' using errcode = ''PT409''',
  '''A published shift changed before it could be opened; try again'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.decide_time_off_service(uuid,uuid,uuid,text,text,text)', array[
  '''This request is already closed'' using errcode = ''PT409''',
  '''This request is already closed'' using errcode = ''PT409'', hint = ''time_off.changed''', '1',
  '''This request was not decided in time'' using errcode = ''PT409''',
  '''This request was not decided in time'' using errcode = ''PT409'', hint = ''time_off.not_decided_in_time''', '1',
  '''The shifts this time off affects have changed. Review them again'' using errcode = ''PT409''',
  '''The shifts this time off affects have changed. Review them again'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.employee_request_action_service(uuid,uuid,uuid,text,text,integer)', array[
  '''stale time off request'' using errcode = ''PT409''',
  '''stale time off request'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.request_time_off_cancellation_service(uuid,uuid,uuid,integer,jsonb,text,uuid)', array[
  '''This request key was used for a different cancellation'' using errcode = ''PT409''',
  '''This request key was used for a different cancellation'' using errcode = ''PT409'', hint = ''time_off.request_reused''', '1',
  '''stale approved leave; refresh before requesting cancellation'' using errcode = ''PT409''',
  '''stale approved leave; refresh before requesting cancellation'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.revoke_time_off_service(uuid,uuid,uuid,integer,text)', array[
  '''This time off changed; refresh before revoking it'' using errcode = ''PT409''',
  '''This time off changed; refresh before revoking it'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.shorten_time_off_service(uuid,uuid,uuid,integer,jsonb,text,uuid)', array[
  '''This request key was used for a different change'' using errcode = ''PT409''',
  '''This request key was used for a different change'' using errcode = ''PT409'', hint = ''time_off.request_reused''', '1',
  '''stale approved leave; refresh before shortening it'' using errcode = ''PT409''',
  '''stale approved leave; refresh before shortening it'' using errcode = ''PT409'', hint = ''time_off.changed''', '1'
]);

select pg_temp.patch('public.submit_time_off_service(uuid,uuid,jsonb,text,text,uuid)', array[
  '''This request key was used for different time-off hours'' using errcode = ''PT409''',
  '''This request key was used for different time-off hours'' using errcode = ''PT409'', hint = ''time_off.request_reused''', '1',
  '''The time zone of your location changed. Review the hours in the current time zone before sending'' using errcode = ''PT409''',
  '''The time zone of your location changed. Review the hours in the current time zone before sending'' using errcode = ''PT409'', hint = ''time_off.timezone_changed''', '1'
]);
