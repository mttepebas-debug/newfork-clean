begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- DAVET-ERISIM (Tur 4 B, Mert 2026-10-20; ROL-CIFT 6.1, 6.3): an invitation carries the employee app and the
-- management app apart, a manager's Manages with it; accepting writes both; until then its access changes and
-- the link stays the same. Manages no longer follows Works at, and no role is placed into two slots.

select tests.world('it');
select tests.person('it', 'ada', 'admin', array['K'], array['cook']);
select tests.person('it', 'can', 'manager', array['K'], array['cook']);
select tests.person('it', 'max', 'manager', array['K'], array['cook']);
select tests.person('it', 'lea', 'manager', array['K'], array['cook']);
select tests.world('ix');

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
create function pg_temp.who(person text) returns uuid language sql as $$ select tests.user('it:' || person) $$;
create function pg_temp.role(key text) returns uuid language sql as $$
  select r.id from public.workspace_roles r where r.workspace_id = tests.id('it') and r.system_key::text = key
$$;
create function pg_temp.places(keys text[]) returns uuid[] language sql as $$
  select coalesce(array_agg(tests.id('it:' || k) order by tests.id('it:' || k)), '{}') from unnest(keys) k
$$;
-- A record with nobody invited yet, working at locs with jobs, and the account its invitation will reach.
create function pg_temp.record(person text, locs text[], jobs text[]) returns uuid language plpgsql as $$
declare account uuid := tests.new_user('it:' || person, initcap(person) || ' Person');
begin
  return tests.remember('it:' || person, (public.create_employee_command_service(
    tests.user('it:owner'), tests.id('it'), gen_random_uuid(),
    jsonb_build_object('first_name', initcap(person), 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
      'invitation_email', (select u.email from auth.users u where u.id = account), 'start_date', '', 'internal_note', '',
      'location_ids', to_jsonb(pg_temp.places(locs)), 'primary_location_id', tests.id('it:' || locs[1]),
      'job_ids', to_jsonb(array(select tests.id('it:job:' || j) from unnest(jobs) j)),
      'primary_job_id', tests.id('it:job:' || jobs[1]),
      'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
    null) ->> 'id')::uuid);
end;
$$;
create function pg_temp.invite(actor text, person text, employee_role uuid, management_role uuid, places text[])
returns text language sql as $$
  select format('select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, %L, %L::uuid[], %L, now() + interval ''7 days'')',
    pg_temp.who(actor), tests.id('it'), tests.id('it:' || person),
    (select u.email from auth.users u where u.id = pg_temp.who(person)), employee_role, management_role,
    pg_temp.places(places), encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'))
$$;
create function pg_temp.change_invite(actor text, person text, employee_role uuid, management_role uuid, places text[])
returns text language sql as $$
  select format('select public.update_employee_invitation_access_service(%L, %L, %L, %L, %L, %L::uuid[])',
    pg_temp.who(actor), tests.id('it'), tests.id('it:' || person), employee_role, management_role, pg_temp.places(places))
$$;
create function pg_temp.pending(person text) returns public.employee_invitations language sql as $$
  select i.* from public.employee_invitations i where i.employee_id = tests.id('it:' || person) and i.status = 'pending'
$$;
create function pg_temp.accept(person text) returns uuid language sql as $$
  select public.accept_employee_invitation_by_id_service(pg_temp.who(person), (pg_temp.pending(person)).id)
$$;
create function pg_temp.member(person text) returns public.workspace_memberships language sql as $$
  select m.* from public.workspace_memberships m where m.workspace_id = tests.id('it') and m.user_id = pg_temp.who(person)
$$;
create function pg_temp.manages(person text) returns uuid[] language sql as $$
  select coalesce(array_agg(l.location_id order by l.location_id), '{}') from public.membership_managed_locations l
  where l.membership_id = (pg_temp.member(person)).id
$$;
create function pg_temp.nothing() returns jsonb language sql as $$
  select '{"shifts_opened": 0, "requests_closed": 0, "applications_closed": 0, "time_off_withdrawn": 0, "availability_deleted": false}'::jsonb
$$;

select pg_temp.record('mona', array['B'], array['cook']);
select pg_temp.record('nur', array['K'], array['general manager']);
select pg_temp.record('pia', array['K'], array['server']);
select pg_temp.record('rob', array['K'], array['cook']);
select pg_temp.record('eli', array['K'], array['cook']);

-- invite_names_one_access_at_least
select is(pg_temp.said(pg_temp.invite('ada', 'rob', null, null, '{}')), '22023 access.role_required',
  'an invitation with no access is refused');
select is(pg_temp.said(pg_temp.invite('ada', 'rob', pg_temp.role('employee'), pg_temp.role('manager'), '{}')),
  '22023 access.manages_required', 'a manager invited to manage nowhere is refused');
select is(pg_temp.said(pg_temp.invite('owner', 'rob', null, pg_temp.role('admin'), array['K'])),
  '22023 access.manages_only_for_manager', 'an admin manages every location: no Manages to name');
select is(pg_temp.said(pg_temp.invite('ada', 'rob', null, pg_temp.role('employee'), '{}')),
  '22023 membership.management_slot', 'the employee role is no management access');
select is(pg_temp.said(pg_temp.invite('ada', 'rob', pg_temp.role('manager'), null, '{}')),
  '22023 membership.employee_slot', 'nor the manager role an employee one');
select is(pg_temp.said(pg_temp.invite('can', 'rob', pg_temp.role('employee'), pg_temp.role('manager'), array['K'])),
  '42501 authz.rank', 'Can, a manager, may not give the management app');
select is(pg_temp.said(pg_temp.invite('can', 'eli', pg_temp.role('employee'), null, '{}')), 'ok',
  'he may invite to the employee app');

-- both_accesses_and_manages_apart: Ada invites Mona, who works at Besiktas, to manage Kadikoy and to work.
select is(pg_temp.said(pg_temp.invite('ada', 'mona', pg_temp.role('employee'), pg_temp.role('manager'), array['K'])),
  'ok', 'Ada invites Mona to both apps');
select is((pg_temp.pending('mona')).employee_role_id, pg_temp.role('employee'), 'the invitation carries the employee app');
select is((pg_temp.pending('mona')).management_role_id, pg_temp.role('manager'), 'and the manager role');
select is((pg_temp.pending('mona')).managed_location_ids, pg_temp.places(array['K']), 'managing Kadikoy');
select is((pg_temp.pending('mona')).role_id, pg_temp.role('manager'), 'its rank is the manager role');
select is(
  public.get_employee_detail_service(tests.user('it:owner'), tests.id('it'), tests.id('it:mona')) -> 'invitation'
    -> 'managed_location_ids', to_jsonb(pg_temp.places(array['K'])), 'the drawer reads what the invitation carries');
select pg_temp.accept('mona');
select is((pg_temp.member('mona')).employee_role_id, pg_temp.role('employee'), 'Mona joins with the employee app');
select is((pg_temp.member('mona')).role_id, pg_temp.role('manager'), 'and the management app as a manager');
select is(pg_temp.manages('mona'), pg_temp.places(array['K']), 'she manages Kadikoy');
select is((select array_agg(a.location_id) from public.employee_location_assignments a
  where a.employee_id = tests.id('it:mona') and a.ended_at is null), pg_temp.places(array['B']), 'and works at Besiktas');
select ok(exists (select 1 from public.membership_management_jobs j where j.membership_id = (pg_temp.member('mona')).id),
  'a management access holds a Management job');
select is(
  public.get_employee_detail_service(tests.user('it:owner'), tests.id('it'), tests.id('it:mona')) -> 'managed_location_ids',
  to_jsonb(pg_temp.places(array['K'])), 'the drawer reads her Manages');

-- manages_stays_apart: where she works changes; what she manages does not.
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
values (tests.id('it'), tests.id('it:mona'), tests.id('it:K'), false, tests.user('it:owner'));
update public.employee_location_assignments set ended_at = now()
where employee_id = tests.id('it:mona') and location_id = tests.id('it:K');
select is(pg_temp.manages('mona'), pg_temp.places(array['K']), 'Manages does not follow Works at');

-- management_only: Nur, filed with a Management job alone, is invited to the management app only.
select is(pg_temp.said(pg_temp.invite('ada', 'nur', null, pg_temp.role('manager'), array['K', 'B'])), 'ok',
  'Ada invites Nur to the management app alone');
select pg_temp.accept('nur');
select is((pg_temp.member('nur')).employee_role_id, null, 'Nur joins without the employee app');
select is(pg_temp.manages('nur'), pg_temp.places(array['K', 'B']), 'managing both locations');
select is((select array_agg(j.job_id) from public.membership_management_jobs j where j.membership_id = (pg_temp.member('nur')).id),
  array[tests.id('it:job:general manager')], 'holding her own Management job');

-- pending_access_changes_in_place: Pia's invitation to the employee app becomes a manager's, the link the same.
select is(pg_temp.said(pg_temp.invite('ada', 'pia', pg_temp.role('employee'), null, '{}')), 'ok', 'Pia is invited to work');
create temporary table first_link as select (pg_temp.pending('pia')).token_hash as token_hash;
select is(pg_temp.said(pg_temp.change_invite('can', 'pia', pg_temp.role('employee'), pg_temp.role('manager'), array['K'])),
  '42501 authz.rank', 'Can may not make her invitation a manager''s');
select is(pg_temp.said(pg_temp.change_invite('ada', 'pia', pg_temp.role('employee'), pg_temp.role('manager'), '{}')),
  '22023 access.manages_required', 'a manager''s invitation names somewhere to manage');
select is(pg_temp.said(pg_temp.change_invite('ada', 'pia', pg_temp.role('employee'), pg_temp.role('manager'), array['K'])),
  'ok', 'Ada makes it a manager''s, at Kadikoy');
select is((pg_temp.pending('pia')).token_hash, (select token_hash from first_link), 'the link that went out stays');
select is((pg_temp.pending('pia')).management_role_id, pg_temp.role('manager'), 'and now opens the management app');
-- Who changes it could have sent the old one too: Can may not take a manager's invitation back to the employee app.
select is(pg_temp.said(pg_temp.change_invite('can', 'pia', pg_temp.role('employee'), null, '{}')), '42501 authz.rank',
  'Can may not change the manager''s invitation Ada sent');
-- Nothing of another workspace goes into an invitation.
select is(pg_temp.said(pg_temp.change_invite('ada', 'pia',
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ix') and r.system_key = 'employee'), null, '{}')),
  '22023 membership.employee_slot', 'another workspace''s role is no access here');
select is(pg_temp.said(format('select public.update_employee_invitation_access_service(%L, %L, %L, %L, %L, %L::uuid[])',
  pg_temp.who('ada'), tests.id('it'), tests.id('it:pia'), pg_temp.role('employee'), pg_temp.role('manager'),
  array[tests.id('ix:K')])), '42501 authz.out_of_scope', 'nor is another workspace''s location somewhere to manage');
select is(pg_temp.said(pg_temp.change_invite('ada', 'rob', pg_temp.role('employee'), null, '{}')), 'P0002',
  'a record with no invitation out has none to change');
select pg_temp.accept('pia');
select is(pg_temp.manages('pia'), pg_temp.places(array['K']), 'Pia joins managing Kadikoy');

-- jobs_follow_the_person: a change that names no Management job keeps the person's own.
create temporary table can_jobs as
  select array_agg(j.job_id order by j.job_id) as jobs from public.membership_management_jobs j
  where j.membership_id = (pg_temp.member('can')).id;
select ok((select cardinality(jobs) from can_jobs) > 0, 'Can, a manager, holds a Management job');
select is(pg_temp.said(format('select public.change_employee_access_service(%L, %L, %L, %L, %L, %L::uuid[], null, %L::jsonb)',
  tests.user('it:owner'), tests.id('it'), tests.id('it:can'), pg_temp.role('employee'), pg_temp.role('admin'), '{}',
  pg_temp.nothing())), 'ok', 'the owner makes Can an admin naming no job');
select is((select array_agg(j.job_id order by j.job_id) from public.membership_management_jobs j
  where j.membership_id = (pg_temp.member('can')).id), (select jobs from can_jobs),
  'he keeps the Management job he held');

-- restore_keeps_both: archived and restored with her access, Mona comes back as she was.
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:mona'), true);
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:mona'), false, true);
select is((pg_temp.member('mona')).role_id, pg_temp.role('manager'), 'restored, Mona manages again');
select is((pg_temp.member('mona')).employee_role_id, pg_temp.role('employee'), 'and works');
select is(pg_temp.manages('mona'), pg_temp.places(array['K']), 'at Kadikoy, as before');

-- rehired_comes_back_as_invited: an account reopened takes the new invitation's access, nothing it held before.
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:max'), true);
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:max'), false, false);
select is(pg_temp.said(pg_temp.invite('owner', 'max', pg_temp.role('employee'), null, '{}')), 'ok',
  'Max, once a manager, is invited back to the employee app alone');
select pg_temp.accept('max');
select is((pg_temp.member('max')).role_id, null, 'he comes back without the management app');
select is(pg_temp.manages('max'), '{}'::uuid[], 'managing nothing');
select ok(not exists (select 1 from public.membership_management_jobs j where j.membership_id = (pg_temp.member('max')).id),
  'holding no Management job');
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:lea'), true);
select public.set_employee_archived_service(tests.user('it:owner'), tests.id('it'), tests.id('it:lea'), false, false);
select is(pg_temp.said(pg_temp.invite('owner', 'lea', pg_temp.role('employee'), pg_temp.role('manager'), array['B'])), 'ok',
  'Lea, who managed Kadikoy, is invited back to manage Besiktas');
select pg_temp.accept('lea');
select is(pg_temp.manages('lea'), pg_temp.places(array['B']), 'she manages Besiktas alone');

select * from finish();
rollback;
