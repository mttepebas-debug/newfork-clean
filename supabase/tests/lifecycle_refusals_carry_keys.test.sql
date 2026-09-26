begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- The account screens used to answer a refusal by matching the English
-- sentence the function raised, and the API picked the HTTP status the same
-- way. Rewording one raise took the sentence off the screen and turned a 403
-- into a 400, with nothing failing. Each refusal now carries a machine key in
-- `hint`, and this is what stops the next one from being added without it.

create temporary table screen_facing_function on commit drop as
select unnest(array[
  'block_closure_when_ownership_transfer_pending',
  'request_workspace_closure_service',
  'cancel_workspace_closure_service',
  'initiate_workspace_ownership_transfer_service',
  'respond_workspace_ownership_transfer_service',
  'cancel_workspace_ownership_transfer_service',
  'search_workspace_ownership_candidates_service'
]) as name;

select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   join screen_facing_function on screen_facing_function.name = routine.proname
   cross join lateral regexp_matches(routine.prosrc, 'raise exception[^;]*', 'g') raised
   where space.nspname = 'public'
     and raised[1] not like '%hint =%'),
  0,
  'every refusal these screens read carries a machine key'
);

-- Names are not ids: a key nobody reads is as useless as no key, and two
-- refusals sharing one key cannot be told apart. Both are worth catching.
select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   join screen_facing_function on screen_facing_function.name = routine.proname
   cross join lateral regexp_matches(routine.prosrc, 'hint = ''([a-z_]+(\.[a-z_]+)+)''', 'g') key
   where space.nspname = 'public'),
  -- 32 since BL-080 added transfer.target_legal_name_missing.
  32,
  'and every key is a dotted lower-case name'
);

create function pg_temp.hint_of(statement text) returns text
language plpgsql as $$
declare raised_hint text;
begin
  execute statement;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;

-- The key has to survive the raise, not just sit in the source.
select is(
  pg_temp.hint_of($$select public.request_workspace_closure_service(
    '19000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002',
    'immediate', 'Nothing', true, null
  )$$),
  'workspace.not_found',
  'and it reaches whoever catches the exception'
);

select is(
  pg_temp.hint_of($$select public.cancel_workspace_closure_service(
    '19000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002'
  )$$),
  'workspace.not_found',
  'from every one of these functions, not just the first'
);

select * from finish();
rollback;
