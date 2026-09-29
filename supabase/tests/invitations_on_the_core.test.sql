begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Inviting on the authorization core (FB-6.2.5, BL-242): who adds and invites
-- somebody, which role they may hand out, and who touches an invitation after
-- it is sent. The matrix probes employee.create cell by cell; these are the
-- rules it cannot reach.

select tests.world('m');
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'pelin', 'employee', array['K'], array['cook'], 'pending');
select tests.person('m', 'nil', 'admin', array['K'], array['server'], 'pending');
select tests.person('m', 'baris', 'employee', array['B'], array['cook'], 'pending');

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;

create function pg_temp.actor(label text) returns uuid language sql as $$
  select tests.user(case label when 'olcay' then 'm:owner' else 'm:' || label end)
$$;

-- Adds somebody at one location and invites them with a role.
create function pg_temp.invite_as(actor text, loc text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format($f$select public.create_employee_command_service(%L, %L, gen_random_uuid(),
      jsonb_build_object('first_name', 'New', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
        'invitation_email', 'new.' || gen_random_uuid() || '@world.test', 'start_date', '', 'internal_note', '',
        'location_ids', jsonb_build_array(%L::uuid), 'primary_location_id', %L::uuid,
        'job_ids', jsonb_build_array(%L::uuid), 'primary_job_id', %L::uuid,
        'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
      %L)$f$,
    pg_temp.actor(actor), tests.id('m'), tests.id('m:' || loc), tests.id('m:' || loc),
    tests.id('m:job:cook'), tests.id('m:job:cook'),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key::text = role_key)))
$$;

-- A manager adds and invites an employee where they work; employee access
-- management is no longer asked (BL-242, manager-cannot-invite).
select is(pg_temp.invite_as('ayse', 'K', 'employee'), 'allowed', 'a manager invites an employee to their own location');
select is(pg_temp.invite_as('ayse', 'B', 'employee'), '42501 authz.out_of_scope', 'a manager invites nobody to another location');
-- The role handed out ranks below whoever hands it out; nobody hands out the owner's.
select is(pg_temp.invite_as('ayse', 'K', 'manager'), '42501 authz.rank', 'a manager invites nobody as a manager');
select is(pg_temp.invite_as('zeynep', 'K', 'manager'), 'allowed', 'an admin invites a manager');
select is(pg_temp.invite_as('zeynep', 'K', 'admin'), '42501 authz.rank', 'an admin invites nobody as an admin');
select is(pg_temp.invite_as('olcay', 'K', 'admin'), 'allowed', 'the owner invites an admin');
select is(pg_temp.invite_as('olcay', 'K', 'owner'), '42501 authz.rank', 'nobody is invited as the owner');

-- An existing record is invited by the same rules, whoever prepares it.
create function pg_temp.prepare_as(actor text, person text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format($f$select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, %L, now() + interval '7 days')$f$,
    pg_temp.actor(actor), tests.id('m'), coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid()),
    person || '.again@world.test',
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key::text = role_key),
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex')))
$$;
select is(pg_temp.prepare_as('ayse', 'pelin', 'employee'), 'allowed', 'a manager sends an invitation again to an employee at their location');
select is(pg_temp.prepare_as('ayse', 'baris', 'employee'), '42501 authz.out_of_scope', 'but not to somebody at another location');
select is(pg_temp.prepare_as('ayse', 'nobody', 'employee'), '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is(pg_temp.prepare_as('ayse', 'pelin', 'manager'), '42501 authz.rank', 'nor with a role at their own rank');

-- After an invitation is sent: copying its link, retrying its delivery and
-- keeping its token for a retry are for whoever could have sent it.
create function pg_temp.link_as(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.load_employee_invitation_link_service(%L, %L, %L)',
    pg_temp.actor(actor), tests.id('m'), coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid())))
$$;
create function pg_temp.retry_as(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.load_employee_invitation_retry_service(%L, %L, %L)',
    pg_temp.actor(actor), tests.id('m'), coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid())))
$$;
create function pg_temp.keep_token_as(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.store_employee_invitation_delivery_secret_service(%L, %L, %L, %L)',
    pg_temp.actor(actor), tests.id('m'),
    coalesce((select i.id from tests.ids i where i.label = 'm:' || person || ':invitation'), gen_random_uuid()),
    coalesce((select c.invitation_token from public.employee_create_commands c
              where c.invitation_id = (select i.id from tests.ids i where i.label = 'm:' || person || ':invitation')),
             repeat('x', 64))))
$$;

select is(pg_temp.keep_token_as('ayse', 'pelin'), 'allowed', 'a manager keeps the token of an invitation at their location');
select is(pg_temp.link_as('ayse', 'pelin'), 'allowed', 'and copies its link');
select is(pg_temp.retry_as('ayse', 'pelin'), 'P0002 ', 'a retry is asked past the permission: nothing failed to retry');
select is(pg_temp.link_as('ayse', 'baris'), '42501 authz.out_of_scope', 'a manager copies no link for another location');
select is(pg_temp.link_as('ayse', 'nobody'), '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is(pg_temp.retry_as('ayse', 'baris'), '42501 authz.out_of_scope', 'a manager retries no delivery for another location');
select is(pg_temp.keep_token_as('ayse', 'baris'), '42501 authz.out_of_scope', 'nor keeps its token');
select is(pg_temp.keep_token_as('ayse', 'nobody'), '42501 authz.out_of_scope', 'an unknown invitation gets the same answer');
-- An admin's invitation at their location is not a manager's to hand on.
select is(pg_temp.keep_token_as('ayse', 'nil'), '42501 authz.rank', 'a manager keeps no token of an admin''s invitation');
select is(pg_temp.link_as('ayse', 'nil'), '42501 authz.rank', 'nor copies its link');
select is(pg_temp.retry_as('ayse', 'nil'), '42501 authz.rank', 'nor retries its delivery');
select is(pg_temp.keep_token_as('olcay', 'nil'), 'allowed', 'the owner keeps it');

-- Setting up the workspace is the owner's (BL-242): the four services of the
-- owner's invitation list ask the core and say why they refuse.
select is(pg_temp.refusal(format('select public.reset_owner_onboarding_service(%L, %L)', pg_temp.actor('zeynep'), tests.id('m'))),
  '42501 authz.owner_only', 'an admin does not start the setup over');
select is(pg_temp.refusal(format('select public.queue_owner_onboarding_invitation_intent_service(%L, %L, %L, %L)',
    pg_temp.actor('zeynep'), tests.id('m'), tests.id('m:pelin'), 'pelin@world.test')),
  '42501 authz.owner_only', 'nor queues the setup''s invitations');
select is(pg_temp.refusal(format('select public.list_owner_onboarding_invitation_intents_service(%L, %L)', pg_temp.actor('zeynep'), tests.id('m'))),
  '42501 authz.owner_only', 'nor lists them');
select is(pg_temp.refusal(format('select public.mark_owner_onboarding_invitation_intent_dispatched_service(%L, %L, %L, null)',
    pg_temp.actor('zeynep'), tests.id('m'), tests.id('m:pelin'))),
  '42501 authz.owner_only', 'nor marks them sent');
select is(pg_temp.refusal(format('select public.list_owner_onboarding_invitation_intents_service(%L, %L)', gen_random_uuid(), tests.id('m'))),
  '42501 authz.not_member', 'somebody who is not a member is told so');
select ok(pg_temp.refusal(format('select public.list_owner_onboarding_invitation_intents_service(%L, %L)', pg_temp.actor('olcay'), tests.id('m'))) !~ '^42501',
  'the owner is not refused');

-- The rule lives in one place (BL-242): no copy of the role rule in the
-- invitation, no JWT written, no role read off the membership.
select ok(
  (select p.prosrc ~ 'can_invite_with_role' and p.prosrc !~* 'access_class' from pg_proc p
   where p.oid = 'public.prepare_employee_invitation_service(uuid,uuid,uuid,text,uuid,text,timestamptz)'::regprocedure),
  'the invitation asks the one role rule and keeps no copy of it'
);
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('prepare_employee_invitation_service', 'load_employee_invitation_link_service',
                       'load_employee_invitation_retry_service', 'store_employee_invitation_delivery_secret_service',
                       'create_employee_command_service')
     and (p.prosrc ~ 'request\.jwt\.claim' or p.prosrc ~ 'can_manage_employee_record' or p.prosrc ~ 'service_actor_has_permission')),
  0, 'the invitation services pretend to be nobody and ask no old gate'
);
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('reset_owner_onboarding_service', 'queue_owner_onboarding_invitation_intent_service',
                       'list_owner_onboarding_invitation_intents_service', 'mark_owner_onboarding_invitation_intent_dispatched_service')
     and p.prosrc ~ 'app_private\.authorize\(' and p.prosrc !~ 'actor_role'),
  4, 'the owner''s setup services ask the core and read no role themselves'
);

select * from finish();
rollback;
