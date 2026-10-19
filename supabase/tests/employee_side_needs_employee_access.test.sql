begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ROL-CIFT slice 6.2 (design §4.1): the employee interface is the employee access's. Somebody who only
-- manages has no hub of their own, nothing of the hub to change and no lineup to acknowledge; the core
-- says so as it does for the other employee-side actions (employee_target, 'rank'). Posts stay read and
-- acknowledged from the management interface too (announcement.read, announcement.acknowledge).

select tests.world('es');
select tests.person('es', 'mona', 'manager', array['K'], array['general manager']);
select tests.person('es', 'dora', 'manager', array['K'], array['cook']);
select tests.no_employee_slot('es', 'mona');

create function pg_temp.reason(person text, action text) returns text language sql as $$
  select app_private.authz_reason(tests.user('es:' || person), tests.id('es'), action)
$$;
create function pg_temp.offered(person text, action text) returns boolean language sql as $$
  select action = any (app_private.actor_actions(app_private.actor(tests.user('es:' || person), tests.id('es'))))
$$;
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

select is(pg_temp.reason('mona', 'employee_hub.read'), 'rank', 'Mona, who only manages, has no hub of her own');
select is(pg_temp.reason('mona', 'employee_hub.self'), 'rank', 'nor anything of it to change');
select is(pg_temp.reason('mona', 'lineup.acknowledge'), 'rank', 'nor a lineup to acknowledge');
select is(pg_temp.reason('dora', 'employee_hub.read'), null, 'Dora, who works shifts too, has hers');
select is(pg_temp.reason('dora', 'employee_hub.self'), null, 'and changes it');
select is(pg_temp.reason('dora', 'lineup.acknowledge'), null, 'and acknowledges her lineup');

-- Posts are read from the management interface too.
select is(pg_temp.reason('mona', 'announcement.read'), null, 'Mona still reads posts');
select is(pg_temp.reason('mona', 'announcement.acknowledge'), null, 'and acknowledges one asked of her');

-- What the core lists for the web (context.actions) says the same.
select ok(not pg_temp.offered('mona', 'employee_hub.read'), 'the web is not told Mona has a hub');
select ok(pg_temp.offered('dora', 'employee_hub.read'), 'it is told Dora has one');
select ok(pg_temp.offered('mona', 'announcement.read'), 'and Mona reads posts');

-- The hub's own reads refuse her the way the core does.
select is(pg_temp.said(format('select public.employee_hub_actor_service(%L, %L)', tests.user('es:mona'), tests.id('es'))),
  '42501 authz.rank', 'the hub has no employee for Mona');
select is((public.employee_hub_actor_service(tests.user('es:dora'), tests.id('es'))).id, tests.id('es:dora'),
  'it has Dora''s record for Dora');
select is(pg_temp.said(format('select public.get_my_lineups_service(%L, %L, %L)', tests.user('es:mona'), tests.id('es'),
  tests.week(1))), '42501 authz.rank', 'Mona has no lineups of her own to read');

select * from finish();
rollback;
