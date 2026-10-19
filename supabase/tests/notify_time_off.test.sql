begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U2 (KARARLAR S-123, S-95, P07; docs/plan/research/BILDIRIM-URETICILER.md §2.3): time off writes its
-- own notices into the new core.
--   (a) a request reaches who decides it: the location's manager; an admin only where no manager can,
--       and the owner only without an admin (KARARLAR S-169); the owner's own time off asks the same;
--   (b) a decision tells the person who asked once, with the outcome; the first decision closes every
--       decider's card ("Approved by ..."); the one who decided hears nothing;
--   (c) withdrawing closes the deciders' cards and writes nothing new;
--   (d) twelve hours before the deadline the managers who have not decided are reminded, once; where no
--       manager can decide, the admins (the owner only without one) are told once instead;
--   (e) shortening tells the person and whoever approved it, never the one who shortened it; revoking
--       tells the person;
--   (f) the two helpers that find recipients ask the core, not role names.

select tests.world('nt');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('nt', 'owner');
select tests.world('nx');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('nx', 'owner');
-- Kadikoy (K) has a manager; Besiktas (B) has none.
select tests.person('nt', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('nt', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('nt', 'emre', 'employee', array['K'], array['cook']);
select tests.person('nt', 'deniz', 'employee', array['B'], array['cook']);
select tests.person('nt', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('nx', 'xena', 'manager', array['K'], array['cook']);

create temp table who as
select label, tests.user(label) uid
from unnest(array['nt:owner', 'nt:ayse', 'nt:zeynep', 'nt:emre', 'nt:deniz', 'nt:ali', 'nx:owner', 'nx:xena']) label;
grant select on who to public;
-- Who got a notice of this type about this request, one label per notice.
create function pg_temp.told(type_key text, rid uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told.type_key and n.subject_id = rid
$$;
create function pg_temp.decide(person text, rid uuid, verdict text, note text default '') returns jsonb language sql as $$
  select public.decide_time_off_service(tests.user('nt:' || person), tests.id('nt'), rid, verdict, note,
    app_private.time_off_impact(tests.id('nt'), rid) ->> 'fingerprint')
$$;
create function pg_temp.card(person text, rid uuid) returns text language sql stable as $$
  select coalesce(n.resolution, 'open') || ' by ' || coalesce(w.label, '-')
  from public.person_notifications n left join who w on w.uid = n.resolved_by
  where n.type_key = 'time_off.requested' and n.subject_id = rid and n.user_id = tests.user('nt:' || person)
$$;
create function pg_temp.status(rid uuid) returns text language sql stable as $$
  select r.status::text from public.schedule_time_off_requests r where r.id = rid
$$;
-- BILDIRIM-12: every notice written so far is in its recipient's choices; checked before a right is taken
-- away (tests.unlisted_notices reads choices now), and remembered.
create temp table checked (id uuid);
create function pg_temp.all_listed(said text) returns text language plpgsql as $$
declare missing text[] := tests.unlisted_notices(tests.id('nt'), array(select id from checked));
begin
  insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('nt');
  return said || ': ' || coalesce(nullif(array_to_string(missing, ', '), ''), 'all listed');
end $$;

-- (f) The helpers -------------------------------------------------------------------------------------

select is(app_private.notify_holders(tests.id('nt'), 'time_off.decide_alone', null, tests.id('nt:emre')),
  array(select tests.user(x) from unnest(array['nt:owner', 'nt:zeynep']) x order by 1),
  '(f) who may decide alone, by the core: the owner and the admin');
select is(app_private.notify_deciders(tests.id('nt'), 'time_off.decide', array[tests.id('nt:K')], tests.id('nt:emre'), 'time_off.decide_alone'),
  array[tests.user('nt:ayse')], '(f) at Kadikoy the manager decides');
select is(app_private.notify_deciders(tests.id('nt'), 'time_off.decide', array[tests.id('nt:B')], tests.id('nt:deniz'), 'time_off.decide_alone'),
  array[tests.user('nt:zeynep')], '(f) at Besiktas, with no manager, the admin: the owner only without one (S-169)');
select is(app_private.notify_deciders(tests.id('nt'), 'time_off.decide', '{}', tests.id('nt:emre'), 'time_off.decide_alone'),
  array[tests.user('nt:zeynep')], '(f) with no location, the admin');
select is(app_private.notify_deciders(tests.id('nx'), 'time_off.decide', '{}', tests.id('nx:xena'), 'time_off.decide_alone'),
  array[tests.user('nx:owner')], '(f) and the owner where there is no admin');

-- (a) A request ---------------------------------------------------------------------------------------

select tests.remember('nt:emre:2', tests.leave('nt', 'emre', 2));
select is(pg_temp.told('time_off.requested', tests.id('nt:emre:2')), array['nt:ayse'],
  '(a) Emre''s request reaches the Kadikoy manager only; not the admin, the owner or another workspace');
select ok((select title = 'Time off request from Emre Person' and url like '/app/schedule/requests?tab=time-off&request=%'
           from public.person_notifications where type_key = 'time_off.requested' and subject_id = tests.id('nt:emre:2')),
  '(a) it names who asked and opens the request');
select is(pg_temp.told('time_off.requested', tests.id('nt:emre:2')) || pg_temp.told('time_off.decided', tests.id('nt:emre:2')),
  array['nt:ayse'], '(a) one notice; Emre is not told of his own request');

select tests.remember('nt:deniz:2', tests.leave('nt', 'deniz', 2));
select is(pg_temp.told('time_off.requested', tests.id('nt:deniz:2')), array['nt:zeynep'],
  '(a) Besiktas has no manager: the admin is asked about Deniz''s, not the owner');

select tests.remember('nt:owner:2', tests.leave('nt', 'owner', 2));
select is(pg_temp.status(tests.id('nt:owner:2')), 'pending', '(a) the owner''s own time off waits like anybody''s');
select is(pg_temp.told('time_off.requested', tests.id('nt:owner:2')) || pg_temp.told('time_off.decided', tests.id('nt:owner:2')),
  array['nt:ayse'], '(a) and asks Kadikoy''s manager');

-- (b) A decision --------------------------------------------------------------------------------------

select pg_temp.decide('ayse', tests.id('nt:emre:2'), 'approve', 'Enjoy');
select is(pg_temp.told('time_off.decided', tests.id('nt:emre:2')), array['nt:emre'],
  '(b) the approval tells Emre once, not Ayse who approved it');
select ok((select title like 'Your time off % is approved' and body = 'Enjoy'
           from public.person_notifications where type_key = 'time_off.decided' and subject_id = tests.id('nt:emre:2')),
  '(b) with the outcome in the title and the note');
select is(pg_temp.card('ayse', tests.id('nt:emre:2')), 'approved by nt:ayse', '(b) Ayse''s card is closed as approved');

select pg_temp.decide('zeynep', tests.id('nt:deniz:2'), 'deny', 'Short-staffed');
select is(pg_temp.told('time_off.decided', tests.id('nt:deniz:2')), array['nt:deniz'], '(b) a decline tells Deniz once');
select ok((select title like 'Your time off % is declined' from public.person_notifications
           where type_key = 'time_off.decided' and subject_id = tests.id('nt:deniz:2')), '(b) and says so');
select is(pg_temp.card('zeynep', tests.id('nt:deniz:2')), 'declined by nt:zeynep', '(b) the admin''s card closes as declined');
select is(pg_temp.told('time_off.requested', tests.id('nt:deniz:2')), array['nt:zeynep'], '(b) nothing more was written');

-- Besiktas gets a manager: Ali, who works at both, is decided at both.
select tests.person('nt', 'mehmet', 'manager', array['B'], array['cook']);
insert into who values ('nt:mehmet', tests.user('nt:mehmet'));
select tests.remember('nt:ali:2', tests.leave('nt', 'ali', 2));
select is(pg_temp.told('time_off.requested', tests.id('nt:ali:2')), array['nt:ayse', 'nt:mehmet'],
  '(b) Ali works at both: each location''s manager is asked');
select pg_temp.decide('ayse', tests.id('nt:ali:2'), 'approve');
select is(pg_temp.status(tests.id('nt:ali:2')), 'pending', '(b) Kadikoy approved; Besiktas still decides');
select is(pg_temp.card('mehmet', tests.id('nt:ali:2')), 'open by -', '(b) so Mehmet''s card stays open');
select is(pg_temp.told('time_off.decided', tests.id('nt:ali:2')), '{}'::text[], '(b) and Ali hears nothing yet');
select pg_temp.decide('mehmet', tests.id('nt:ali:2'), 'approve');
select is(pg_temp.told('time_off.decided', tests.id('nt:ali:2')), array['nt:ali'], '(b) the last approval tells Ali once');
select is(pg_temp.card('ayse', tests.id('nt:ali:2')), 'approved by nt:mehmet', '(b) and Ayse''s card says Mehmet settled it');

-- Not decided in time: the system declines it.
select tests.remember('nt:emre:3', tests.leave('nt', 'emre', 3));
update public.schedule_time_off_requests set decide_by = now() - interval '1 minute' where id = tests.id('nt:emre:3');
select app_private.time_off_sweep();
select ok((select title like 'Your time off % wasn''t decided in time' from public.person_notifications
           where type_key = 'time_off.decided' and subject_id = tests.id('nt:emre:3') and user_id = tests.user('nt:emre')),
  '(b) not decided in time: Emre hears it was declined for that');
select is(pg_temp.card('ayse', tests.id('nt:emre:3')), 'expired by -', '(b) and Ayse''s card closes');

-- A cancellation of approved time off is a request too.
create temp table cancel_ask as
select (public.request_time_off_cancellation_service(tests.user('nt:emre'), tests.id('nt'), tests.id('nt:emre:2'),
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('nt:emre:2')),
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at))
   from public.schedule_time_off_segments s where s.request_id = tests.id('nt:emre:2')),
  'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid rid;
select is(pg_temp.told('time_off.requested', (select rid from cancel_ask)), array['nt:ayse'],
  '(b) a cancellation request reaches the manager');
select ok((select title = 'Emre Person asked to cancel time off' from public.person_notifications
           where type_key = 'time_off.requested' and subject_id = (select rid from cancel_ask)), '(b) and says what it is');

-- (c) Withdrawn ---------------------------------------------------------------------------------------

select public.employee_request_action_service(tests.user('nt:emre'), tests.id('nt'), (select rid from cancel_ask), 'time_off', 'cancel',
  (select r.revision from public.schedule_time_off_requests r where r.id = (select rid from cancel_ask)));
select is(pg_temp.card('ayse', (select rid from cancel_ask)), 'withdrawn by nt:emre', '(c) withdrawing closes Ayse''s card');
select is(pg_temp.told('time_off.decided', (select rid from cancel_ask)) || pg_temp.told('time_off.requested', (select rid from cancel_ask)),
  array['nt:ayse'], '(c) and writes nothing new');

-- (d) Reminders ---------------------------------------------------------------------------------------

select tests.remember('nt:emre:5', tests.leave('nt', 'emre', 5));
-- Deniz asks while Besiktas has its manager; then Mehmet's access ends and nobody there can decide it.
select tests.remember('nt:deniz:5', tests.leave('nt', 'deniz', 5));
select is(pg_temp.told('time_off.requested', tests.id('nt:deniz:5')), array['nt:mehmet'], '(d) Mehmet is asked');
select is(pg_temp.all_listed('before Mehmet''s access goes'), 'before Mehmet''s access goes: all listed',
  'every notice so far is in its recipient''s choices (BILDIRIM-12)');
select public.remove_employee_access_service(tests.user('nt:owner'), tests.id('nt'), tests.id('nt:mehmet'));
select tests.remember('nt:emre:6', tests.leave('nt', 'emre', 6));
update public.schedule_time_off_requests set decide_by = now() + interval '6 hours', created_at = now() - interval '2 days'
where id in (tests.id('nt:emre:5'), tests.id('nt:deniz:5'));
select app_private.time_off_sweep();
select app_private.time_off_sweep();
select is(pg_temp.told('time_off.decision_reminder', tests.id('nt:emre:5')), array['nt:ayse'],
  '(d) twelve hours before the deadline the manager who has not decided is reminded, once over two passes');
select ok((select title like 'Decide by %: Emre Person''s time off' from public.person_notifications
           where type_key = 'time_off.decision_reminder' and subject_id = tests.id('nt:emre:5')), '(d) naming the day and the person');
select is(pg_temp.told('time_off.decision_reminder', tests.id('nt:deniz:5')), array['nt:zeynep'],
  '(d) no manager can decide Deniz''s now: the admin is told once, not twice; the owner, with an admin there, not at all');
select ok((select bool_and(title = 'Deniz Person''s time off waits for an admin') from public.person_notifications
           where type_key = 'time_off.decision_reminder' and subject_id = tests.id('nt:deniz:5')),
  '(d) saying no manager can decide it');
select is(pg_temp.told('time_off.decision_reminder', tests.id('nt:emre:6')), '{}'::text[], '(d) a request not near its deadline: nothing');
select pg_temp.decide('ayse', tests.id('nt:emre:5'), 'approve');
select is((select resolution from public.person_notifications
           where type_key = 'time_off.decision_reminder' and subject_id = tests.id('nt:emre:5')), 'approved',
  '(d) the decision closes the reminder too');

-- (e) Shortened, revoked ------------------------------------------------------------------------------

select public.shorten_time_off_service(tests.user('nt:zeynep'), tests.id('nt'), tests.id('nt:emre:5'),
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('nt:emre:5')),
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.starts_at + interval '2 hours'))
   from public.schedule_time_off_segments s where s.request_id = tests.id('nt:emre:5')),
  'Needed for the morning', gen_random_uuid());
select is(pg_temp.told('time_off.shortened', tests.id('nt:emre:5')), array['nt:ayse', 'nt:emre'],
  '(e) shortening tells Emre and Ayse who approved it, once each; not Zeynep who shortened it');
select is(
  array(select title from public.person_notifications where type_key = 'time_off.shortened' and subject_id = tests.id('nt:emre:5') order by title),
  array['Emre Person''s time off was shortened', 'Your time off was shortened'], '(e) each in their own words');

-- Who approved it is told only while they may still decide it: Can approves Emre's week 7 and is then
-- made an employee; Baris, who works Kadikoy and Besiktas, approves week 8 and then leaves Kadikoy.
select tests.person('nt', 'can', 'manager', array['K'], array['cook']);
select tests.person('nt', 'baris', 'manager', array['K', 'B'], array['cook']);
insert into who values ('nt:can', tests.user('nt:can')), ('nt:baris', tests.user('nt:baris'));
create function pg_temp.shorten(rid uuid) returns jsonb language sql as $$
  select public.shorten_time_off_service(tests.user('nt:zeynep'), tests.id('nt'), rid,
    (select r.revision from public.schedule_time_off_requests r where r.id = rid),
    (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.starts_at + interval '2 hours'))
     from public.schedule_time_off_segments s where s.request_id = rid),
    'Needed for the morning', gen_random_uuid())
$$;
select tests.remember('nt:emre:7', tests.leave('nt', 'emre', 7));
select pg_temp.decide('can', tests.id('nt:emre:7'), 'approve');
select is(pg_temp.all_listed('before Can is made an employee'), 'before Can is made an employee: all listed',
  'every notice so far is in its recipient''s choices (BILDIRIM-12)');
select public.update_employee_membership_role_service(tests.user('nt:owner'), tests.id('nt'), tests.id('nt:can'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('nt') and r.system_key = 'employee'));
select pg_temp.shorten(tests.id('nt:emre:7'));
select is(pg_temp.told('time_off.shortened', tests.id('nt:emre:7')), array['nt:emre'],
  '(e) Can approved it but is an employee now: only Emre is told');

select tests.remember('nt:emre:8', tests.leave('nt', 'emre', 8));
select pg_temp.decide('baris', tests.id('nt:emre:8'), 'approve');
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('nt') and m.user_id = tests.user('nt:baris')), tests.id('nt:K'));
select pg_temp.shorten(tests.id('nt:emre:8'));
select is(pg_temp.told('time_off.shortened', tests.id('nt:emre:8')), array['nt:emre'],
  '(e) Baris approved it but no longer works Kadikoy: only Emre is told');

select public.revoke_time_off_service(tests.user('nt:ayse'), tests.id('nt'), tests.id('nt:emre:2'),
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('nt:emre:2')), 'We need you that week');
select is(pg_temp.told('time_off.decided', tests.id('nt:emre:2')), array['nt:emre', 'nt:emre'],
  '(e) revoking tells Emre once more; Ayse who revoked it hears nothing');
select ok((select title like 'Your time off % was revoked' and body = 'We need you that week' from public.person_notifications
           where type_key = 'time_off.decided' and subject_id = tests.id('nt:emre:2') and event_key like '%:revoked'),
  '(e) saying it was revoked and why');

-- Each world's owner invited its people, and hears each one joined: in that world only (BILDIRIM-U4a).
select is((select count(*)::integer from public.person_notifications n
           where n.type_key = 'people.joined' and n.workspace_id in (tests.id('nt'), tests.id('nx'))
             and not ((n.workspace_id = tests.id('nt') and n.user_id = tests.user('nt:owner'))
                   or (n.workspace_id = tests.id('nx') and n.user_id = tests.user('nx:owner')))), 0,
  '"joined" goes only to each world''s owner, in that world');
select is((select count(*)::integer from public.person_notifications n join who w on w.uid = n.user_id
           where w.label like 'nx:%' and n.type_key <> 'people.joined'), 0,
  'another workspace hears nothing of this one');

-- Who hears a notice may choose about it: Blkd asks for time off, then misses a required document; the
-- decision is still his to hear, and to choose how (BILDIRIM-12).
select tests.person('nt', 'blkd', 'employee', array['K'], array['cook']);
select tests.remember('nt:blkd:9', tests.leave('nt', 'blkd', 9));
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('nt:owner'), tests.id('nt'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('nt:owner'), tests.id('nt'), id);
select public.set_document_publication_service(tests.user('nt:owner'), tests.id('nt'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: Blkd's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('nt:blkd');
select is((app_private.actor(tests.user('nt:blkd'), tests.id('nt'))).document_blocked, true, 'Blkd misses a required document');
select pg_temp.decide('ayse', tests.id('nt:blkd:9'), 'approve');
select is((select count(*)::integer from public.person_notifications
           where type_key = 'time_off.decided' and user_id = tests.user('nt:blkd')), 1, 'Blkd hears the decision');
select is(pg_temp.all_listed('at the end'), 'at the end: all listed',
  'every notice written here is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;
