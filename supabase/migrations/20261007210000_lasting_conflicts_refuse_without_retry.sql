-- BL-958 (ACIL-40001, KK-211): a lasting conflict was refused with SQLSTATE
-- 40001 (an old revision, a reused request key, a closed request, a changed
-- list, picture of the shifts or time zone). PostgREST takes 40001 for a
-- passing serialization failure and runs the same request again without end,
-- holding one of its pooled connections; about ten such saves stopped the API
-- for every workspace (EKRAN-08-CEKMECE, 2026-10-07). These refusals now
-- answer PT409, which PostgREST hands back at once; the sentence and any hint
-- stay, and a stale employee save names itself (employee.revision_conflict).
-- The API answers both codes with 409 (apps/api/src/http-error.ts).
--
-- The two "a shift changed under us" refusals (time_off_release_shifts,
-- important_date_close_shifts) answer PT409 too: they read the shift through
-- shift_exchange_shift, which can hand back a moved copy, so the same request
-- may fail the same way every time; a real lost race now asks the person to
-- look again instead of being retried. Schedule's editing, template, auto-fill
-- and publishing services are EKRAN-01's and stay as they are.
--
-- The change is made on each function's definition as the database holds it
-- when this runs (pg_get_functiondef), not on a copy of its body: a newer
-- version of one of these functions, landed by another job before this
-- migration or already live, keeps all of its own changes and loses only the
-- 40001. CREATE OR REPLACE keeps the signature, SECURITY DEFINER, search_path,
-- grants and comments.
do $migration$
declare
  targets constant text[][] := array[
    ['app_private', 'apply_owner_onboarding_update'], ['app_private', 'important_date_close_shifts'],
    ['app_private', 'time_off_finalize'], ['app_private', 'time_off_release_shifts'],
    ['public', 'create_employee_command_service'], ['public', 'decide_time_off_service'],
    ['public', 'employee_request_action_service'], ['public', 'leave_employee_onboarding_service'],
    ['public', 'publish_announcement_service'], ['public', 'request_time_off_cancellation_service'],
    ['public', 'review_employee_onboarding_before_availability_service'], ['public', 'revoke_time_off_service'],
    ['public', 'save_announcement_audience_service'], ['public', 'save_employee_onboarding_profile_service'],
    ['public', 'save_employee_service'], ['public', 'save_important_date_service'],
    ['public', 'save_notification_policy_service'], ['public', 'save_notification_user_preferences_service'],
    ['public', 'set_announcement_state_service'], ['public', 'set_important_date_state_service'],
    ['public', 'shorten_time_off_service'], ['public', 'submit_employee_onboarding_service'],
    ['public', 'submit_time_off_service'], ['public', 'weekly_preference_settings_save_service']];
  -- The ways a body can raise 40001 (keywords are case-insensitive in PL/pgSQL).
  raises_40001 constant text := $re$(errcode\s*=\s*'(40001|serialization_failure)'|raise\s+(exception\s+)?sqlstate\s+'40001'|raise\s+serialization_failure)$re$;
  i integer;
  fn record;
  definition text;
begin
  for i in 1 .. array_length(targets, 1) loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = targets[i][1] and p.proname = targets[i][2]
    ) then
      raise exception 'BL-958: %.% is gone; check the list before moving on', targets[i][1], targets[i][2];
    end if;

    for fn in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = targets[i][1] and p.proname = targets[i][2] and p.prosrc ~* raises_40001
    loop
      definition := pg_get_functiondef(fn.oid);
      if targets[i][2] = 'save_employee_service' then
        definition := regexp_replace(definition,
          $re$('employee revision conflict'\s+using\s+)errcode\s*=\s*'40001'$re$,
          $rep$\1errcode = 'PT409', hint = 'employee.revision_conflict'$rep$, 'gi');
      end if;
      definition := regexp_replace(definition, $re$errcode\s*=\s*'40001'$re$, $rep$errcode = 'PT409'$rep$, 'gi');
      execute definition;
    end loop;
  end loop;

  -- Nothing on the list may still raise 40001 in any form this did not rewrite.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join unnest(targets[:][1:1], targets[:][2:2]) t(schema_name, function_name)
      on t.schema_name = n.nspname and t.function_name = p.proname
    where p.prosrc ~* raises_40001
  ) then
    raise exception 'BL-958: a listed function still raises 40001 in a form this migration does not rewrite';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'save_employee_service'
      and p.prosrc like '%employee.revision_conflict%'
  ) then
    raise exception 'BL-958: save_employee_service does not name employee.revision_conflict';
  end if;
end
$migration$;
