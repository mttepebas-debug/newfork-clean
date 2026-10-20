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

-- The access an invitation with this role names (DAVET-ERISIM): an employee role in the employee slot,
-- a management role in the management one, a manager managing the given locations.
create function pg_temp.access(role_key text, places uuid[]) returns jsonb language sql as $$
  select jsonb_build_object(
    'employee_role_id', case when r.access_class = 'employee' then r.id end,
    'management_role_id', case when r.access_class <> 'employee' then r.id end,
    'managed_location_ids', case when r.access_class = 'manager' then to_jsonb(places) else '[]'::jsonb end)
  from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key::text = role_key
$$;

-- Adds somebody at one location and invites them with a role.
create function pg_temp.invite_as(actor text, loc text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format($f$select public.create_employee_command_service(%L, %L, gen_random_uuid(),
      jsonb_build_object('first_name', 'New', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
        'invitation_email', 'new.' || gen_random_uuid() || '@world.test', 'start_date', '', 'internal_note', '',
        'location_ids', jsonb_build_array(%L::uuid), 'primary_location_id', %L::uuid,
        'job_ids', jsonb_build_array(%L::uuid), 'primary_job_id', %L::uuid,
        'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
      %L::jsonb)$f$,
    pg_temp.actor(actor), tests.id('m'), tests.id('m:' || loc), tests.id('m:' || loc),
    tests.id('m:job:cook'), tests.id('m:job:cook'),
    pg_temp.access(role_key, array[tests.id('m:' || loc)])))
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
-- The owner's role fits neither slot, so it is refused before anybody's rank is asked.
select is(pg_temp.invite_as('olcay', 'K', 'owner'), '22023 membership.management_slot', 'nobody is invited as the owner');

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
select is(pg_temp.retry_as('ayse', 'pelin'), 'allowed', 'and sends it a reminder (BL-767: a delivered invitation is not refused)');
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

-- Marking a delivery and taking an invitation back follow the same rule: the
-- API marks every invitation it sends, a manager's included.
create function pg_temp.mark_as(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.mark_employee_invitation_delivery_service(%L, %L, %L, %L)',
    pg_temp.actor(actor), tests.id('m'),
    coalesce((select i.id from tests.ids i where i.label = 'm:' || person || ':invitation'), gen_random_uuid()), 'sent'))
$$;
create function pg_temp.revoke_as(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.revoke_employee_invitation_service(%L, %L, %L)',
    pg_temp.actor(actor), tests.id('m'), coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid())))
$$;
select is(pg_temp.mark_as('ayse', 'baris'), '42501 authz.out_of_scope', 'a manager marks no delivery for another location');
select is(pg_temp.mark_as('ayse', 'nobody'), '42501 authz.out_of_scope', 'an unknown invitation gets the same answer');
select is(pg_temp.mark_as('ayse', 'nil'), '42501 authz.rank', 'nor an admin''s invitation');
select is(pg_temp.revoke_as('ayse', 'baris'), '42501 authz.out_of_scope', 'a manager takes back no invitation at another location');
select is(pg_temp.revoke_as('ayse', 'nobody'), '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is(pg_temp.revoke_as('ayse', 'nil'), '42501 authz.rank', 'nor an admin''s invitation');
select is(pg_temp.revoke_as('ayse', 'pelin'), 'allowed', 'a manager takes back an invitation at their location');

-- An existing record is invited again by the same rules, whoever prepares it
-- (after the one above was taken back).
create function pg_temp.prepare_as(actor text, person text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format($f$select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, %L, %L::uuid[], %L, now() + interval '7 days')$f$,
    pg_temp.actor(actor), tests.id('m'), coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid()),
    person || '.again@world.test',
    a ->> 'employee_role_id', a ->> 'management_role_id',
    array(select jsonb_array_elements_text(a -> 'managed_location_ids')),
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex')))
  from pg_temp.access(role_key, array[tests.id('m:K')]) a
$$;
select is(pg_temp.prepare_as('ayse', 'pelin', 'employee'), 'allowed', 'a manager sends an invitation again to an employee at their location');
select is(pg_temp.prepare_as('ayse', 'baris', 'employee'), '42501 authz.out_of_scope', 'but not to somebody at another location');
select is(pg_temp.prepare_as('ayse', 'nobody', 'employee'), '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is(pg_temp.prepare_as('ayse', 'pelin', 'manager'), '42501 authz.rank', 'nor with a role at their own rank');

-- Inviting again takes back the invitation waiting before it: only one the
-- actor could take back themselves (nf-guvenlik O-2). The owner invites Pat
-- as a manager; Ayse, a manager at the same location, may not replace it with
-- an employee invitation of her own. Asked as the API asks (service_role).
select tests.person('m', 'pat', 'manager', array['K'], array['cook'], 'pending');
create function pg_temp.as_api(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  set local role service_role;
  execute statement;
  reset role;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
select is(
  pg_temp.as_api(format($f$select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, null, '{}', %L, now() + interval '7 days')$f$,
    pg_temp.actor('ayse'), tests.id('m'), tests.id('m:pat'), 'pat.again@world.test',
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'employee'),
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'))),
  '42501 authz.rank', 'a manager does not replace the owner''s manager invitation with one of her own'
);
select is(
  (select array_agg(i.status::text) from public.employee_invitations i where i.employee_id = tests.id('m:pat')),
  array['pending'], 'the owner''s invitation is still waiting'
);

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
  (select p.prosrc ~ 'can_invite_with_role' and p.prosrc !~ 'actor_role' from pg_proc p
   where p.oid = 'public.prepare_employee_invitation_service(uuid,uuid,uuid,text,uuid,uuid,uuid[],text,timestamptz)'::regprocedure),
  'the invitation asks the one role rule and keeps no copy of it'
);
select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('prepare_employee_invitation_service', 'load_employee_invitation_link_service',
                       'load_employee_invitation_retry_service', 'store_employee_invitation_delivery_secret_service',
                       'create_employee_command_service', 'mark_employee_invitation_delivery_service',
                       'revoke_employee_invitation_service')
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
