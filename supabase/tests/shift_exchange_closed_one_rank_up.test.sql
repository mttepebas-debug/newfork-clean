begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Who may close a shift change (EXCHANGE-CLOSE-RANK; ILKELER P07, KARARLAR G1, K-S1):
-- its owner takes it back, or someone who outranks the owner where it is
-- closes it; a peer reads the case (G1) and closes nothing.
-- Kadikoy has two managers, Ayse and Can; Zeynep and Kaan are admins.
-- Besiktas has Veli and no manager.

select tests.world('xc');
select tests.person('xc', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('xc', 'can', 'manager', array['K'], array['cook']);
select tests.person('xc', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('xc', 'kaan', 'admin', array['K'], array['cook']);
select tests.person('xc', 'emre', 'employee', array['K'], array['cook']);
select tests.person('xc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('xc', 'veli', 'employee', array['B'], array['cook']);

select tests.publish_week('xc', 1, '[
  {"label": "ayse-k",   "person": "ayse",   "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "zeynep-k", "person": "zeynep", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "emre-k",   "person": "emre",   "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "ali-k",    "person": "ali",    "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "veli-b",   "person": "veli",   "loc": "B", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"}
]');

select tests.cover_case('xc', 'ayse-k', 'ayse', 'ali');
select tests.cover_case('xc', 'zeynep-k', 'zeynep', 'emre');
select tests.cover_case('xc', 'emre-k', 'emre', 'ali');
select tests.cover_case('xc', 'ali-k', 'ali', 'emre');
select tests.cover_case('xc', 'veli-b', 'veli', 'ali');

create function pg_temp.said(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;
create function pg_temp.close(person text, label text) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user(case person when 'owner' then 'xc:owner' else 'xc:' || person end), tests.id('xc'),
    jsonb_build_object('action', 'close', 'case_id', tests.id('xc:case:' || label), 'reason', '',
      'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('xc:case:' || label))), gen_random_uuid())
$$;
create function pg_temp.status(label text) returns text language sql as $$
  select status from public.shift_exchange_cases where id = tests.id('xc:case:' || label)
$$;

-- 1. A peer manager reads the manager's case (G1) and cannot close it.
select is((select c ->> 'can_manage' from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('xc:can'), tests.id('xc'),
  true, tests.week(1), tests.week(1) + 6, tests.id('xc:case:ayse-k')) -> 'cases') c where c ->> 'id' = tests.id('xc:case:ayse-k')::text),
  'false', 'Can reads Ayse''s cover, without its buttons');
select is(pg_temp.said($$select pg_temp.close('can', 'ayse-k')$$), '42501 authz.rank', 'Can cannot close his peer Ayse''s cover');
select is(pg_temp.status('ayse-k'), 'open', 'it stays open');
select is(pg_temp.said($$select pg_temp.close('ali', 'ayse-k')$$), '42501 authz.missing_permission', 'nor can Ali, who asked for it');
select is(pg_temp.close('zeynep', 'ayse-k') ->> 'status', 'cancelled', 'the admin closes it');

-- 2. An admin's cover: a peer admin and a manager close nothing; the owner does.
select is(pg_temp.said($$select pg_temp.close('kaan', 'zeynep-k')$$), '42501 authz.rank', 'Kaan cannot close his peer Zeynep''s cover');
select is(pg_temp.said($$select pg_temp.close('ayse', 'zeynep-k')$$), '42501 authz.rank', 'nor can Ayse, below her');
select is(pg_temp.status('zeynep-k'), 'open', 'it stays open');
select is(pg_temp.close('owner', 'zeynep-k') ->> 'status', 'cancelled', 'the owner closes it');

-- 3. An employee's cover: their manager closes it; the owner of a cover takes it back.
select is(pg_temp.close('can', 'emre-k') ->> 'status', 'cancelled', 'Can closes Emre''s cover');
select is(pg_temp.close('ali', 'ali-k') ->> 'status', 'cancelled', 'Ali takes his own back');

-- 4. Out of the manager's locations, the same answer as before.
select is(pg_temp.said($$select pg_temp.close('ayse', 'veli-b')$$), '42501 authz.out_of_scope', 'Ayse closes nothing at Besiktas');
select is(pg_temp.status('veli-b'), 'open', 'Veli''s cover stays open');

select * from finish();
rollback;
