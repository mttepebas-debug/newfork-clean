begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- The builder (supabase/test-support/builder.sql) makes what the product makes.
-- If a product path changes shape, this says so before the matrix does.

select tests.world('tw');
select tests.world('other');
select tests.person('tw', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tw', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('tw', 'nur', 'manager', null, null);
select tests.person('tw', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('tw', 'pelin', 'employee', array['B'], array['cook'], 'pending');
select tests.person('tw', 'sami', 'employee', array['B'], array['cook'], 'suspended');

select is(
  (select lifecycle_status::text from public.workspaces where id = tests.id('tw')),
  'active',
  'a world is an open workspace'
);
select is(
  (select count(*)::integer from public.locations where workspace_id = tests.id('tw')),
  2,
  'a world has Kadikoy and Besiktas'
);
select is(
  (select count(*)::integer from public.employee_location_assignments
   where employee_id = tests.id('tw:owner') and ended_at is null),
  2,
  'the owner is filed at every location'
);
select isnt(tests.id('tw'), tests.id('other'), 'two worlds are two workspaces');

create temporary table world_membership as
select i.label, coalesce((select r.access_class::text from public.workspace_roles r where r.id = m.role_id), 'employee') as role, m.status::text as status,
  array(
    select s.location_id from public.membership_location_scopes s
    where s.membership_id = m.id order by s.location_id
  ) as scope
from tests.ids i
join public.workspace_memberships m on m.user_id = i.id and m.workspace_id = tests.id('tw')
where i.label like 'tw:%:user';

select is((select status from world_membership where label = 'tw:ayse:user'), 'active', 'an accepted person who finished onboarding is active');
select is((select role from world_membership where label = 'tw:ayse:user'), 'manager', 'the invited role is the membership role');
select is((select scope from world_membership where label = 'tw:ayse:user'), array[tests.id('tw:K')], 'a manager manages where they work');
select is((select scope from world_membership where label = 'tw:nur:user'), '{}'::uuid[], 'a manager with no location manages nowhere');
select is((select status from world_membership where label = 'tw:aydan:user'), 'pending_activation', 'onboarding not finished stays pending activation');
select ok(not exists (select 1 from world_membership where label = 'tw:pelin:user'), 'an unaccepted invitation has no membership');
select is((select status from world_membership where label = 'tw:sami:user'), 'suspended', 'removed access suspends the membership');

select ok(
  extract(isodow from tests.week(0)) = 1 and tests.week(1) - tests.week(0) = 7 and tests.week(0) > current_date + 600,
  'tests.week is a Monday well in the future, a week apart'
);

select * from finish();
rollback;
