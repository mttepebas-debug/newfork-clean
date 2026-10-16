begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U4a (KARARLAR S-123, S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.5): people write their own
-- notices into the new core (part 4, the people slice: invitations, onboarding, preferred name).
--   (a) an invitation accepted, declined or dropped (its invitee's account going) tells whoever sent it while
--       the core says they still may invite that person; once each; never the invitee; the dropped one
--       never says why;
--   (b) the five-cell probe for the inviter: made an employee, moved off the location, a role without the
--       right, missing a required document, access removed: then who may invite that person now is told;
--   (c) an onboarding sent in tells who may act on it now: whoever may approve a changed legal name, and,
--       when the workspace asks for a final approval, whoever may review onboarding; a change asked tells
--       the person, and closes the reviewers' cards; sent again, the person's card closes; finished, the
--       person hears it and every card closes;
--   (d) a preferred name waiting for an answer tells who may decide it (the domain's own deciders); asked
--       again, the old cards close; the first answer closes them all and tells the person once.

select tests.world('np');
select tests.world('nz');
select tests.person('np', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('np', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('np', 'veli', 'manager', array['B'], array['cook']);
select tests.person('np', 'emre', 'employee', array['K'], array['cook']);
-- The five who will lose the right to invite, in (b).
select tests.person('np', 'dmo', 'manager', array['K'], array['cook']);
select tests.person('np', 'mov', 'manager', array['K', 'B'], array['cook']);
select tests.person('np', 'lim', 'manager', array['K'], array['cook']);
select tests.person('np', 'blk', 'manager', array['K'], array['cook']);
select tests.person('np', 'gon', 'manager', array['K'], array['cook']);

create temp table who as select label, tests.user(label) uid
from unnest(array['np:owner', 'np:zeynep', 'np:ayse', 'np:veli', 'np:emre', 'np:dmo', 'np:mov', 'np:lim', 'np:blk',
  'np:gon', 'nz:owner']) label;
create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('np:' || person)
$$;
-- Who was told, by label, one entry per notice.
create function pg_temp.told(type_key text, subject uuid default null) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told.type_key and n.workspace_id = tests.id('np') and (subject is null or n.subject_id = subject)
$$;
-- Somebody invites a new person at their own locations; the invitee gets a sign-in and is told apart.
create function pg_temp.invite(inviter text, label text, locs text[] default array['K']) returns uuid language plpgsql as $$
declare
  person uuid := tests.new_user('np:' || label, initcap(label) || ' Person');
  created jsonb;
begin
  created := public.create_employee_command_service(pg_temp.u(inviter), tests.id('np'), gen_random_uuid(),
    jsonb_build_object('first_name', initcap(label), 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
      'invitation_email', (select x.email from auth.users x where x.id = person), 'start_date', '', 'internal_note', '',
      'location_ids', to_jsonb(array(select tests.id('np:' || k) from unnest(locs) k)), 'primary_location_id', tests.id('np:' || locs[1]),
      'job_ids', jsonb_build_array(tests.id('np:job:cook')), 'primary_job_id', tests.id('np:job:cook'),
      'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('np') and r.system_key = 'employee'));
  insert into who values ('np:' || label, person);
  perform tests.remember('np:' || label, (created ->> 'id')::uuid);
  return tests.remember('np:' || label || ':invitation', (created ->> 'invitation_id')::uuid);
end $$;

-- (a) An invitation's outcome ----------------------------------------------------------------------------

select pg_temp.invite('ayse', 'jale');
select public.accept_employee_invitation_by_id_service(pg_temp.u('jale'), tests.id('np:jale:invitation'));
select is(pg_temp.told('people.joined', tests.id('np:jale')), array['np:ayse'],
  '(a) Jale accepts: Ayse, who invited her, is told; Jale is not');
select ok((select bool_and(n.title = 'Jale Person accepted your invitation') from public.person_notifications n
           where n.type_key = 'people.joined' and n.subject_id = tests.id('np:jale')), '(a) by name');
select pg_temp.invite('ayse', 'kaan');
select public.decline_employee_invitation_service(pg_temp.u('kaan'), tests.id('np:kaan:invitation'));
select is(pg_temp.told('people.invitation_declined'), array['np:ayse'], '(a) Kaan declines: Ayse is told, once');
select pg_temp.invite('ayse', 'lale');
select public.request_account_deletion_v2_service(pg_temp.u('lale'), repeat('a', 64));
select is(pg_temp.told('people.invitation_cancelled'), array['np:ayse'], '(a) Lale''s invitation drops: Ayse is told');
select ok((select bool_and(n.title || coalesce(n.body, '') not ilike '%delet%' and n.title || coalesce(n.body, '') not ilike '%account%')
           from public.person_notifications n where n.type_key = 'people.invitation_cancelled'),
  '(a) never saying why (the invitee''s account is theirs)');

-- (c) Onboarding --------------------------------------------------------------------------------------------
-- Pia gives a legal name that is not the one she was invited with: only an owner or an admin may approve it.

select tests.person('np', 'pia', 'employee', array['K'], array['cook'], 'onboarding');
insert into who values ('np:pia', tests.user('np:pia'));
create function pg_temp.pia_case() returns public.employee_onboarding_cases language sql stable as $$
  select c from public.employee_onboarding_cases c where c.employee_id = tests.id('np:pia')
$$;
create function pg_temp.pia_sends(legal_first text) returns integer language plpgsql as $$
begin
  perform public.save_employee_onboarding_profile_service(pg_temp.u('pia'), jsonb_build_object(
      'legal_first_name', legal_first, 'legal_last_name', 'Person', 'phone', tests.phone('np:pia'),
      'emergency_contact_name', 'Contact', 'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
    (pg_temp.pia_case()).revision, tests.id('np'));
  return public.submit_employee_onboarding_service(pg_temp.u('pia'), (pg_temp.pia_case()).revision, tests.id('np'));
end $$;
select pg_temp.pia_sends('Pina');
select is(pg_temp.told('people.onboarding_review_needed'), array['np:owner', 'np:zeynep'],
  '(c) Pia''s new legal name waits for the owner and Zeynep, who may approve it; not Ayse, not Pia');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.onboarding_review_needed'
           and n.subject_id = (pg_temp.pia_case()).id and n.title = 'Pia Person''s onboarding is ready for review'), 2,
  '(c) saying whose');
create function pg_temp.profile_requirement() returns uuid language sql stable as $$
  select r.id from public.employee_onboarding_requirements r where r.case_id = (pg_temp.pia_case()).id and r.kind = 'profile'
$$;
select public.review_employee_onboarding_service(pg_temp.u('owner'), tests.id('np'), tests.id('np:pia'), 'reject_requirement',
  pg_temp.profile_requirement(), 'Use the name on your ID', (pg_temp.pia_case()).revision, true);
select is(pg_temp.told('people.onboarding_change_requested'), array['np:pia'], '(c) a change asked tells Pia');
select is((select n.body from public.person_notifications n where n.type_key = 'people.onboarding_change_requested'),
  'Use the name on your ID', '(c) with what to change');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.onboarding_review_needed'
           and n.resolved_at is null and n.workspace_id = tests.id('np')), 0, '(c) and closes the reviewers'' cards');
select pg_temp.pia_sends('Pinar');
select is((select n.resolved_at is not null from public.person_notifications n where n.type_key = 'people.onboarding_change_requested'),
  true, '(c) sent again: Pia''s card closes');
select is(pg_temp.told('people.onboarding_review_needed'), array['np:owner', 'np:owner', 'np:zeynep', 'np:zeynep'],
  '(c) and it waits for the owner and Zeynep again');
select public.review_employee_onboarding_service(pg_temp.u('zeynep'), tests.id('np'), tests.id('np:pia'), 'accept_requirement',
  pg_temp.profile_requirement(), '', (pg_temp.pia_case()).revision, true);
select is((pg_temp.pia_case()).status::text, 'approved', '(c) Zeynep approves the name and Pia is in');
select is(pg_temp.told('people.onboarding_completed'), array['np:pia'], '(c) Pia hears her onboarding is complete; Zeynep does not');
select is((select array_agg(n.resolution order by n.resolution) from public.person_notifications n
           where n.type_key = 'people.onboarding_review_needed' and n.subject_id = (pg_temp.pia_case()).id),
  array['approved', 'approved', 'changes_requested', 'changes_requested'],
  '(c) the first round''s cards read Changes requested, the second''s Approved');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.onboarding_review_needed'
           and n.subject_id = (pg_temp.pia_case()).id and n.resolved_at is null), 0, '(c) no card stays open');

-- Rio's workspace asks for a final approval: whoever may review onboarding is told, his managers at Kadikoy
-- too (Ayse and the five of (b), who still hold the right here).
insert into public.employee_onboarding_settings (workspace_id, final_approval_required) values (tests.id('np'), true)
on conflict (workspace_id) do update set final_approval_required = true;
select tests.person('np', 'rio', 'employee', array['K'], array['cook'], 'onboarding');
insert into who values ('np:rio', tests.user('np:rio'));
create function pg_temp.rio_case() returns public.employee_onboarding_cases language sql stable as $$
  select c from public.employee_onboarding_cases c where c.employee_id = tests.id('np:rio')
$$;
select public.save_employee_onboarding_profile_service(pg_temp.u('rio'), jsonb_build_object(
    'legal_first_name', 'Rio', 'legal_last_name', 'Person', 'phone', tests.phone('np:rio'),
    'emergency_contact_name', 'Contact', 'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
  (pg_temp.rio_case()).revision, tests.id('np'));
select public.submit_employee_onboarding_service(pg_temp.u('rio'), (pg_temp.rio_case()).revision, tests.id('np'));
select is(pg_temp.told('people.onboarding_review_needed', (pg_temp.rio_case()).id),
  array['np:ayse', 'np:blk', 'np:dmo', 'np:gon', 'np:lim', 'np:mov', 'np:owner', 'np:zeynep'],
  '(c) Rio waits for a final approval: the owner, Zeynep and his Kadikoy managers; not Veli at Besiktas');
select public.review_employee_onboarding_service(pg_temp.u('ayse'), tests.id('np'), tests.id('np:rio'), 'activate',
  null, '', (pg_temp.rio_case()).revision, true);
select is(pg_temp.told('people.onboarding_completed', (pg_temp.rio_case()).id), array['np:rio'], '(c) Ayse lets him in: Rio is told');
select is((select array_agg(distinct coalesce(n.resolution, 'open')) from public.person_notifications n
           where n.type_key = 'people.onboarding_review_needed' and n.subject_id = (pg_temp.rio_case()).id),
  array['approved'], '(c) every card reads Approved');
update public.employee_onboarding_settings set final_approval_required = false where workspace_id = tests.id('np');

-- (d) Preferred name ---------------------------------------------------------------------------------------

insert into public.employee_name_settings (workspace_id, preferred_name_approval) values (tests.id('np'), 'manager')
on conflict (workspace_id) do update set preferred_name_approval = 'manager';
create function pg_temp.asks(person text, wanted text) returns text language sql as $$
  select public.request_employee_preferred_name_service(pg_temp.u(person), tests.id('np'), tests.id('np:' || person), wanted)
$$;
create function pg_temp.request(person text) returns uuid language sql stable as $$
  select r.id from public.employee_preferred_name_requests r where r.employee_id = tests.id('np:' || person) and r.status = 'pending'
$$;
select is(pg_temp.asks('emre', 'Em'), 'waiting', '(d) Emre asks to be called Em');
create temp table first_ask as select pg_temp.request('emre') id;
select is(pg_temp.told('people.preferred_name_requested'),
  array['np:ayse', 'np:blk', 'np:dmo', 'np:gon', 'np:lim', 'np:mov', 'np:owner', 'np:zeynep'],
  '(d) who may decide it is told: the owner, Zeynep and his Kadikoy managers; not Veli at Besiktas, not Emre');
select pg_temp.asks('emre', 'Emo');
create temp table second_ask as select pg_temp.request('emre') id;
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.preferred_name_requested'
           and n.subject_id = (select id from first_ask) and n.resolved_at is null), 0, '(d) asked again: the first ask''s cards close');
select is(pg_temp.told('people.preferred_name_requested', pg_temp.request('emre')),
  array['np:ayse', 'np:blk', 'np:dmo', 'np:gon', 'np:lim', 'np:mov', 'np:owner', 'np:zeynep'],
  '(d) and the new ask is told');
select public.decide_employee_preferred_name_service(pg_temp.u('ayse'), tests.id('np'), (select id from second_ask), true);
select is(pg_temp.told('people.preferred_name_decided'), array['np:emre'], '(d) Ayse approves: Emre hears it once, Ayse does not');
select is((select n.title from public.person_notifications n where n.type_key = 'people.preferred_name_decided'),
  'You''ll be called Emo', '(d) saying what');
select is((select array_agg(distinct n.resolution) from public.person_notifications n
           where n.type_key = 'people.preferred_name_requested' and n.subject_id = (select id from second_ask)), array['approved'],
  '(d) the deciders'' cards read Approved');
select is(pg_temp.asks('owner', 'Boss'), 'published', '(d) the owner''s own preferred name needs nobody');
select is((select count(*)::integer from public.person_notifications n join public.employee_preferred_name_requests r on r.id = n.subject_id
           where n.type_key = 'people.preferred_name_requested' and r.employee_id = tests.id('np:owner')), 0, '(d) and tells nobody');

-- Every notice so far is in its recipient's choices, read before anyone loses a right (BILDIRIM-12).
create temp table checked as select n.id from public.person_notifications n where n.workspace_id = tests.id('np');
select is(tests.unlisted_notices(tests.id('np')), '{}'::text[], 'so far every notice is in its recipient''s choices (BILDIRIM-12)');

-- (b) The inviter's five cells -----------------------------------------------------------------------------
-- Six managers at Kadikoy invite one person each. Ayse keeps the right; Dmo is made an employee, Mov leaves
-- Kadikoy, Lim's role loses employees, Blk misses a required document, Gon's access is removed. Then each
-- invitee accepts.

create temp table invited as select person, pg_temp.invite(person, 'new' || person) id
from unnest(array['ayse', 'dmo', 'mov', 'lim', 'blk', 'gon']) person;
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('np') on conflict do nothing;
select tests.role('np', 'no employees', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('np') and r.system_key = 'manager' and rp.permission_key <> 'employees.manage'));
select public.update_employee_membership_role_service(pg_temp.u('owner'), tests.id('np'), tests.id('np:dmo'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('np') and r.system_key = 'employee'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('np') and m.user_id = pg_temp.u('mov')), tests.id('np:K'));
select public.update_employee_membership_role_service(pg_temp.u('owner'), tests.id('np'), tests.id('np:lim'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('np') and r.name = 'no employees'));
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(pg_temp.u('owner'), tests.id('np'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(pg_temp.u('owner'), tests.id('np'), id);
select public.set_document_publication_service(pg_temp.u('owner'), tests.id('np'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- The card asks everybody for it, Gon too, while he is still a member: read before his access goes.
select is(tests.unlisted_notices(tests.id('np'), array(select id from checked)), '{}'::text[],
  '(b) the card''s notices are in their recipients'' choices, read before Gon''s access goes (BILDIRIM-12)');
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('np') on conflict do nothing;
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = pg_temp.u('blk');
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('np'), tests.id('np:gon'));
select is(
  (select array_agg(person || ' ' || coalesce(app_private.authz_reason(pg_temp.u(person), tests.id('np'), 'employee.invite',
     null, tests.id('np:new' || person)), 'ok') order by person) from invited),
  array['ayse ok', 'blk document_blocked', 'dmo missing_permission', 'gon not_active', 'lim missing_permission', 'mov out_of_scope'],
  '(b) the core: Ayse may invite her invitee; the five may not');

select public.accept_employee_invitation_by_id_service(tests.user('np:new' || person), id) from invited;
create function pg_temp.joined(person text) returns text[] language sql stable as $$
  select pg_temp.told('people.joined', tests.id('np:new' || person))
$$;
select is(pg_temp.joined('ayse'), array['np:ayse'], '(b) Ayse''s invitee joins: Ayse, who still may invite, is told');
select is(
  (select array_agg(person || ': ' || array_to_string(pg_temp.joined(person), ',') order by person) from invited where person <> 'ayse'),
  array['blk: np:ayse,np:owner,np:zeynep', 'dmo: np:ayse,np:owner,np:zeynep', 'gon: np:ayse,np:owner,np:zeynep',
        'lim: np:ayse,np:owner,np:zeynep', 'mov: np:ayse,np:owner,np:zeynep'],
  '(b) one whose inviter may no longer invite tells who may, never the inviter');
select ok((select bool_and(n.title = 'Newdmo Person accepted an invitation') from public.person_notifications n
           where n.type_key = 'people.joined' and n.subject_id = tests.id('np:newdmo')), '(b) and says it is not theirs');

select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('nz')), 0,
  'another workspace hears nothing of this one');
select is(tests.unlisted_notices(tests.id('np'), array(select id from checked)), '{}'::text[],
  'every notice written since is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;
