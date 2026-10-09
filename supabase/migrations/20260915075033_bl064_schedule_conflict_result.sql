-- A business confirmation is not a serialization failure. PostgREST versions
-- with automatic 40001 retries otherwise never return this decision to the UI.
-- Keep the canonical preparer and its permissions/fingerprint checks intact.
do $migration$
declare
  definition text := pg_get_functiondef('public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)'::regprocedure);
  old_statement text := $old$raise exception 'Review the current availability assessment before saving' using errcode='40001'$old$;
  new_statement text := $new$raise exception 'Review the current availability assessment before saving' using errcode='PT409'$new$;
begin
  if position(old_statement in definition) = 0 then
    raise exception 'Weekly assignment review rejection anchor changed';
  end if;
  execute replace(definition, old_statement, new_statement);
end;
$migration$;
