begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- AVATAR-IKON: the drawing archive's keys live in app_private.lineup_art, filled by the archive
-- migration from scripts/lineup-art/archive.json (gen.mjs writes its insert block). The keys a job or
-- an avatar may name are checked against it (app_private.lineup_art_keys_valid); a job's suggested
-- drawings come from it (app_private.suggest_lineup_art; its answers are pinned name by name in
-- lineup_art_parity.test.sql). Nothing here is reachable from the browser.

select is((select count(*)::integer from app_private.lineup_art), 181, 'the archive has 181 drawings');
select is((select count(*)::integer from app_private.lineup_art where kind = 'team'), 8, '8 of them are team drawings');
select is(
  (select array_agg(no order by no) = array(select generate_series(1, 181)) from app_private.lineup_art),
  true,
  'the drawings are numbered 1 to 181 without a gap'
);
select is(
  (select count(*)::integer from app_private.lineup_art where (kind = 'team') <> (cardinality(jobs) = 0)),
  0,
  'only team drawings suit no job'
);

-- Which keys a job or an avatar may name.
select is(app_private.lineup_art_keys_valid(array['001-server']), true, 'a key from the archive is valid');
select is(app_private.lineup_art_keys_valid(array['001-server', '053-server-tray-ill']), true, 'two different keys are valid');
select is(app_private.lineup_art_keys_valid('{}'::text[]), true, 'no key at all is valid');
select is(app_private.lineup_art_keys_valid(array['nope']), false, 'a key the archive does not have is not valid');
select is(app_private.lineup_art_keys_valid(array['001-server', '001-server']), false, 'the same key twice is not valid');
select is(app_private.lineup_art_keys_valid(array['001-server', null]), false, 'a missing key is not valid');
select is(app_private.lineup_art_keys_valid(null), false, 'no list is not valid');

-- The suggestion rule's edges (the parity test pins the everyday names).
select is(app_private.suggest_lineup_art('   '), '{}'::text[], 'a blank job name gets no suggestion');
select is(app_private.suggest_lineup_art(null), '{}'::text[], 'no job name gets no suggestion');
-- Team drawings suit no job today; the rule leaves them out even if one ever names a job.
update app_private.lineup_art set jobs = array['zz team test'] where key = (select key from app_private.lineup_art where kind = 'team' order by no limit 1);
select is(app_private.suggest_lineup_art('ZZ Team Test'), '{}'::text[], 'a team drawing is never suggested');
select is(
  (select p.provolatile::text from pg_proc p where p.oid = 'app_private.suggest_lineup_art(text)'::regprocedure),
  's',
  'the suggestion rule reads the archive, so it is stable, not immutable'
);

-- The browser reaches none of it. Each grant is pinned on its own: the throws_ok below would also pass
-- if the browser roles merely lacked USAGE on app_private, so it does not prove the table grant alone.
select ok(not has_table_privilege('authenticated', 'app_private.lineup_art', 'SELECT'), 'a signed-in request has no SELECT on the archive table');
select ok(not has_table_privilege('anon', 'app_private.lineup_art', 'SELECT'), 'an anonymous request has no SELECT on the archive table');
select ok(not has_function_privilege('authenticated', 'app_private.suggest_lineup_art(text)', 'EXECUTE'), 'a signed-in request cannot call the suggestion rule');
select ok(not has_function_privilege('anon', 'app_private.suggest_lineup_art(text)', 'EXECUTE'), 'an anonymous request cannot call the suggestion rule');
select ok(not has_function_privilege('authenticated', 'app_private.lineup_art_keys_valid(text[])', 'EXECUTE'), 'a signed-in request cannot call the key check');
select ok(not has_function_privilege('anon', 'app_private.lineup_art_keys_valid(text[])', 'EXECUTE'), 'an anonymous request cannot call the key check');

set local role authenticated;
select throws_ok($$select key from app_private.lineup_art$$, '42501', null, 'a signed-in request cannot read the archive table');
reset role;

select * from finish();
rollback;
