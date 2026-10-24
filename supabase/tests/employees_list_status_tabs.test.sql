begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- KARARLAR S-256: the Employees list's tabs are All · Needs you · Joining ·
-- Active · Archived. Needs you holds who sent their onboarding in and waits
-- for the manager's last Approve (onboarding `submitted`); a person the
-- manager sent back for changes (`changes_requested`) has the next move
-- themselves, so they are Joining, not Needs you. The list tells the two
-- apart: `needs_attention` and `changes_requested`, each its own status that
-- the status filter matches on its own.
-- Example: Sam sent his onboarding in; Cara was asked for changes; Olga is
-- still filling hers in; Nina was invited; Xena's invitation ran out.

select tests.world('st');
select tests.person('st', 'sam', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('st', 'cara', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('st', 'olga', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('st', 'nina', 'employee', array['K'], array['cook'], 'pending');
select tests.person('st', 'xena', 'employee', array['K'], array['cook'], 'pending');
select tests.person('st', 'emre', 'employee', array['K'], array['cook']);

-- ponytail: the list reads only the case's status; the review flow that sets it has its own tests.
update public.employee_onboarding_cases set status = 'submitted', submitted_at = now()
where employee_id = tests.id('st:sam');
update public.employee_onboarding_cases set status = 'changes_requested', submitted_at = now()
where employee_id = tests.id('st:cara');
-- ponytail: an invitation that ran out, moved into the past by hand.
update public.employee_invitations set created_at = now() - interval '30 days', expires_at = now() - interval '1 day'
where employee_id = tests.id('st:xena');

-- A person's status on the owner's list.
create function pg_temp.status_of(person text) returns text language sql as $$
  select row.display_status
  from public.list_employees_service(tests.user('st:owner'), tests.id('st'), false, '', 'all', 200, 0) row
  where row.id = tests.id('st:' || person)
$$;
-- Whom one status holds, by label, among the world's people.
create function pg_temp.holds(status text) returns text[] language sql as $$
  select coalesce(array_agg(person order by person), '{}')
  from unnest(array['owner', 'sam', 'cara', 'olga', 'nina', 'xena', 'emre']) person
  where exists (
    select 1 from public.list_employees_service(tests.user('st:owner'), tests.id('st'), false, '', status, 200, 0) row
    where row.id = tests.id('st:' || person))
$$;

-- 1. Each person's status ---------------------------------------------------------------

select is(pg_temp.status_of('sam'), 'needs_attention', 'Sam sent his onboarding in: it needs the manager');
select is(pg_temp.status_of('cara'), 'changes_requested', 'Cara was asked for changes: her own move, its own status');
select is(pg_temp.status_of('olga'), 'onboarding', 'Olga is still filling hers in');
select is(pg_temp.status_of('nina'), 'invited', 'Nina was invited');
select is(pg_temp.status_of('xena'), 'not_invited', 'Xena''s invitation ran out');
select is(pg_temp.status_of('emre'), 'active', 'Emre is active');

-- 2. The status filter matches each one on its own ------------------------------------

select is(pg_temp.holds('needs_attention'), array['sam'], 'needs_attention holds only who sent theirs in');
select is(pg_temp.holds('changes_requested'), array['cara'], 'changes_requested holds only who was sent back');
select is(pg_temp.holds('onboarding'), array['olga'], 'onboarding holds only who is filling it in');
select is(pg_temp.holds('invited'), array['nina'], 'invited holds only the live invitation');
select is(pg_temp.holds('not_invited'), array['xena'], 'not_invited holds the run-out invitation');
select is(pg_temp.holds('all'), array['cara', 'emre', 'nina', 'olga', 'owner', 'sam', 'xena'], 'all holds everybody');

-- 3. Active wins over an onboarding case left open --------------------------------------

update public.employee_onboarding_cases set status = 'changes_requested', approved_at = null, approved_by = null
where employee_id = tests.id('st:emre');
select is(pg_temp.status_of('emre'), 'active', 'an active person stays Active whatever their case says');

select * from finish();
rollback;
