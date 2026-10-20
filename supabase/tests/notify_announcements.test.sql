begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- DAVET-ERISIM: a role change is an access change (the single-role service is gone). An employee role
-- takes the employee slot and empties the management one; a management role goes beside the employee
-- slot held, a manager managing where they work.
create function pg_temp.change_role(actor uuid, w uuid, emp uuid, next_role uuid) returns jsonb language sql as $$
  select public.change_employee_access_service(actor, w, emp,
    case when r.access_class = 'employee' then r.id else m.employee_role_id end,
    case when r.access_class <> 'employee' then r.id end,
    case when r.access_class = 'manager' then array(select a.location_id from public.employee_location_assignments a
      where a.employee_id = emp and a.ended_at is null) else '{}'::uuid[] end,
    null, null)
  from public.workspace_roles r, public.employee_profiles e
  join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
  where r.id = next_role and e.id = emp
$$;
grant execute on function pg_temp.change_role(uuid, uuid, uuid, uuid) to public;

-- BILDIRIM-U6 (KARARLAR S-123, S-124, S-126 (2), S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.7):
-- announcements write their own notices into the new core (part 4, the announcements slice).
--   (a) published: the audience the post reaches now (announcement_recipients), never its writer nor
--       whoever published it; once;
--   (b) updated: a change in what it says tells those it reaches who have not acknowledged it; people it
--       newly reaches hear it is published;
--   (c) Remind: a post that asks for acknowledgement reminds those who have not acknowledged it (the
--       domain tracks acknowledgement, not reading: a post that asks for none has no Remind); at most twice
--       a day for one post, in the post's own time zone, enforced here;
--   (d) cancelled: a dated post taken back tells those it reaches; one without a day tells nobody, as its
--       History says;
--   (e) a scheduled post that goes out tells its audience, not whoever scheduled it;
--   (f) a scheduled post that could not go out tells whoever scheduled it while the core says they still
--       may write there; otherwise who may write there now (S-127). The five-cell probe: demoted, moved
--       off the location, a role without the right, document-blocked, access removed. Its card closes
--       when it is scheduled again.

select tests.world('na');
select tests.world('nx');
select tests.person('na', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('na', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('na', 'veli', 'manager', array['B'], array['cook']);
select tests.person('na', 'emre', 'employee', array['K'], array['cook']);
select tests.person('na', 'ali', 'employee', array['K'], array['server']);
select tests.person('na', 'deniz', 'employee', array['B'], array['server']);

create temp table who as select label, tests.user(label) uid
from unnest(array['na:owner', 'na:zeynep', 'na:ayse', 'na:veli', 'na:emre', 'na:ali', 'na:deniz', 'nx:owner']) label;

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('na:' || person)
$$;
create function pg_temp.try(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$$;
create function pg_temp.rev(id uuid) returns integer language sql as $$
  select revision from public.announcements where announcements.id = rev.id
$$;
-- A post at these locations (each Open); extra adds or overrides fields (starts_on, ask_ack, publish_at).
create function pg_temp.payload(keys text[], title text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'body', 'Body of ' || title,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location_id', tests.id('na:' || k), 'day', 'open')) from unnest(keys) k),
      '[]'::jsonb)) || extra
$$;
create function pg_temp.save(person text, id uuid, p jsonb, intent text) returns jsonb language sql as $$
  select public.save_announcement_service(pg_temp.u(person), tests.id('na'), id, pg_temp.rev(id), p, intent)
$$;
create function pg_temp.draft(person text, p jsonb) returns uuid language sql as $$
  select (pg_temp.save(person, null, p, 'draft') ->> 'announcement_id')::uuid
$$;
create function pg_temp.state(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_announcement_state_service(pg_temp.u(person), tests.id('na'), id, pg_temp.rev(id), action)
$$;
-- Who was told, by label, one entry per notice.
create function pg_temp.told(type_key text, subject uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told.type_key and n.subject_id = subject
$$;

-- (a) Published ------------------------------------------------------------------------------------------
-- Ayse writes and publishes a Kadikoy post that asks to be acknowledged.

create temp table rules as select pg_temp.draft('ayse', pg_temp.payload(array['K'], 'Knife rules', '{"ask_ack": true}')) id;
select pg_temp.save('ayse', (select id from rules), pg_temp.payload(array['K'], 'Knife rules', '{"ask_ack": true}'), 'publish');
select is(pg_temp.told('announcements.published', (select id from rules)), array['na:ali', 'na:emre', 'na:owner', 'na:zeynep'],
  '(a) the post reaches Kadikoy: Ali, Emre, the owner and Zeynep; not Ayse who wrote and published it, not Besiktas');
select ok((select bool_and(n.title = 'Knife rules' and n.url = '/app/announcements/' || (select id from rules)::text)
           from public.person_notifications n where n.type_key = 'announcements.published' and n.subject_id = (select id from rules)),
  '(a) by its title, opening the post');
select pg_temp.save('ayse', (select id from rules), pg_temp.payload(array['K'], 'Knife rules', '{"ask_ack": true}'), 'save');
select is(pg_temp.told('announcements.published', (select id from rules)), array['na:ali', 'na:emre', 'na:owner', 'na:zeynep'],
  '(a) saved again with nothing new: nobody is told again');

-- (b) Updated ---------------------------------------------------------------------------------------------

select public.acknowledge_announcement_service(pg_temp.u('emre'), tests.id('na'), (select id from rules));
-- Zeynep, an admin there, changes it.
select pg_temp.save('zeynep', (select id from rules), pg_temp.payload(array['K', 'B'], 'Knife rules, new text', '{"ask_ack": true}'), 'save');
select is(pg_temp.told('announcements.updated', (select id from rules)), array['na:ali', 'na:owner'],
  '(b) the new text tells Ali and the owner, who have not acknowledged it; not Emre who has, not Zeynep who changed it, not Ayse who wrote it');
select is(pg_temp.told('announcements.published', (select id from rules)),
  array['na:ali', 'na:deniz', 'na:emre', 'na:owner', 'na:veli', 'na:zeynep'],
  '(b) adding Besiktas tells Deniz and Veli it is published, the people it newly reaches');
select ok((select bool_and(n.title = 'Updated: Knife rules, new text') from public.person_notifications n
           where n.type_key = 'announcements.updated' and n.subject_id = (select id from rules)), '(b) saying it changed');
select pg_temp.save('zeynep', (select id from rules), pg_temp.payload(array['K', 'B'], 'Knife rules, new text', '{"ask_ack": true}'), 'save');
select is(pg_temp.told('announcements.updated', (select id from rules)), array['na:ali', 'na:owner'], '(b) saved again unchanged: once');
-- Kadikoy is taken off and put back: Emre, who acknowledged it, is not told it is out again.
select pg_temp.save('zeynep', (select id from rules), pg_temp.payload(array['B'], 'Knife rules, new text', '{"ask_ack": true}'), 'save');
select pg_temp.save('zeynep', (select id from rules), pg_temp.payload(array['K', 'B'], 'Knife rules, new text', '{"ask_ack": true}'), 'save');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'announcements.published'
           and n.subject_id = (select id from rules) and n.user_id = tests.user('na:emre')), 1,
  '(b) Emre, who acknowledged it, is not told again when it reaches him again');

-- (c) Remind ----------------------------------------------------------------------------------------------
-- It asks those it reaches who rank below Ayse, who published it (announcement_respondents): Ali, Emre,
-- Deniz. Emre acknowledged; the owner presses Remind.

create function pg_temp.reminders_left(person text, id uuid) returns integer language sql as $$
  select (public.get_announcement_service(pg_temp.u(person), tests.id('na'), id) ->> 'reminders_left_today')::integer
$$;
select is(pg_temp.reminders_left('owner', (select id from rules)), 2, '(c) two reminders today before any');
select is((pg_temp.state('owner', (select id from rules), 'remind') ->> 'told')::integer, 2, '(c) Remind is for two people');
select is(pg_temp.told('announcements.reminder', (select id from rules)), array['na:ali', 'na:deniz'],
  '(c) Ali and Deniz, who have not acknowledged it; not Emre who has, not Zeynep or Veli whom it does not ask');
select ok((select bool_and(n.title = 'Reminder: Knife rules, new text') from public.person_notifications n
           where n.type_key = 'announcements.reminder' and n.workspace_id = tests.id('na')), '(c) saying it is a reminder');
select public.acknowledge_announcement_service(pg_temp.u('ali'), tests.id('na'), (select id from rules));
select is(pg_temp.reminders_left('owner', (select id from rules)), 1, '(c) one left today');
select pg_temp.state('owner', (select id from rules), 'remind');
select is(pg_temp.told('announcements.reminder', (select id from rules)), array['na:ali', 'na:deniz', 'na:deniz'],
  '(c) the second tells Deniz again, not Ali who acknowledged in between');
select is(pg_temp.reminders_left('owner', (select id from rules)), 0, '(c) none left today');
select is(pg_temp.try(format($$select pg_temp.state('owner', %L, 'remind')$$, (select id from rules))),
  'PT409 announcement.remind_limit', '(c) a third Remind the same day is refused, here in the database');
select is((select count(*)::integer from public.person_notifications where type_key = 'announcements.reminder'
           and workspace_id = tests.id('na')), 3,
  '(c) and tells nobody');
-- ponytail: a day passes by moving today's reminders back one; now() is fixed inside the transaction.
update public.announcement_changes set changed_at = changed_at - interval '1 day'
where announcement_id = (select id from rules) and action = 'reminded';
select is(pg_temp.reminders_left('owner', (select id from rules)), 2, '(c) the next day, two again');
select is(pg_temp.try(format($$select pg_temp.state('owner', %L, 'remind')$$, (select id from rules))), 'ok',
  '(c) and Remind works');
select is(pg_temp.reminders_left('emre', (select id from rules)), null, '(c) Emre, who may not write it, reads no count');
create temp table plain as select pg_temp.draft('owner', pg_temp.payload(array['K'], 'Menu tasting')) id;
select pg_temp.save('owner', (select id from plain), pg_temp.payload(array['K'], 'Menu tasting'), 'publish');
select is(pg_temp.try(format($$select pg_temp.state('owner', %L, 'remind')$$, (select id from plain))),
  'PT409 announcement.changed', '(c) a post that asks for no acknowledgement has no Remind');

-- (d) Cancelled -------------------------------------------------------------------------------------------

create temp table party as select pg_temp.draft('ayse', pg_temp.payload(array['K'], 'Staff party',
  jsonb_build_object('starts_on', current_date + 20))) id;
select pg_temp.save('ayse', (select id from party), pg_temp.payload(array['K'], 'Staff party',
  jsonb_build_object('starts_on', current_date + 20)), 'publish');
select pg_temp.state('owner', (select id from party), 'unpublish');
select is(pg_temp.told('announcements.cancelled', (select id from party)), array['na:ali', 'na:emre', 'na:zeynep'],
  '(d) the staff party taken back tells those it reached; not Ayse who wrote it, not the owner who took it back');
select ok((select bool_and(n.title like 'Staff party on % is cancelled') from public.person_notifications n
           where n.type_key = 'announcements.cancelled' and n.workspace_id = tests.id('na')), '(d) saying it is cancelled');
select pg_temp.state('owner', (select id from plain), 'unpublish');
select is(pg_temp.told('announcements.cancelled', (select id from plain)), '{}'::text[],
  '(d) a post without a day taken back tells nobody: its History says nobody was told');

-- (e) A scheduled post goes out ---------------------------------------------------------------------------

create function pg_temp.schedule(person text, title text, due boolean default true, places text[] default array['K'])
returns uuid language plpgsql as $$
declare
  p jsonb := pg_temp.payload(places, title, jsonb_build_object('starts_on', current_date + 10,
    'publish_at', now() + interval '1 hour'));
  made uuid := pg_temp.draft(person, p);
begin
  perform pg_temp.save(person, made, p, 'schedule');
  -- ponytail: its hour comes by moving it back; now() is fixed inside the transaction.
  update public.announcements set publish_at = now() - interval '1 minute' where id = made and due;
  return made;
end;
$$;
create temp table soon as select pg_temp.schedule('ayse', 'Inventory day') id;
select app_private.announcement_release(tests.id('na'));
select is(pg_temp.told('announcements.published', (select id from soon)), array['na:ali', 'na:emre', 'na:owner', 'na:zeynep'],
  '(e) out on time: Kadikoy is told, not Ayse who scheduled it');

-- Every notice so far is in its recipient's choices, read before anyone loses a right (BILDIRIM-12).
create temp table checked as select n.id from public.person_notifications n where n.workspace_id = tests.id('na');
select is(tests.unlisted_notices(tests.id('na')), '{}'::text[], 'so far every notice is in its recipient''s choices (BILDIRIM-12)');

-- (f) A scheduled post that could not go out ------------------------------------------------------------
-- Six managers at Kadikoy schedule a post each. Ayse keeps the right; Dmo is made an employee, Mov
-- leaves Kadikoy, Lim's role loses announcements, Blk misses a required document, Gon's access is removed.
-- Each post's day comes before it can go out (too late), so it fails whoever scheduled it. Three more cells
-- where the right is a place's: the owner's post for Kadikoy and Besiktas, an admin's two-location post after
-- the admin is made a Kadikoy manager, and Veli's Besiktas post after Besiktas is archived.

select tests.person('na', 'dmo', 'manager', array['K'], array['cook']);
select tests.person('na', 'mov', 'manager', array['K', 'B'], array['cook']);
select tests.person('na', 'lim', 'manager', array['K'], array['cook']);
select tests.person('na', 'blk', 'manager', array['K'], array['cook']);
select tests.person('na', 'gon', 'manager', array['K'], array['cook']);
select tests.person('na', 'adm', 'admin', array['K'], array['server']);
insert into who select label, tests.user(label) from unnest(array['na:dmo', 'na:mov', 'na:lim', 'na:blk', 'na:gon', 'na:adm']) label;
create temp table late as select person, pg_temp.schedule(person, 'Deep clean by ' || person, false) id
from unnest(array['ayse', 'dmo', 'mov', 'lim', 'blk', 'gon']) person;
insert into late values
  ('owner', pg_temp.schedule('owner', 'Both kitchens by owner', false, array['K', 'B'])),
  ('adm', pg_temp.schedule('adm', 'Both kitchens by adm', false, array['K', 'B'])),
  ('veli', pg_temp.schedule('veli', 'Besiktas by veli', false, array['B']));
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('na')
on conflict do nothing;

select tests.role('na', 'no announcements', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('na') and r.system_key = 'manager' and rp.permission_key not like 'announcements.%'));
select pg_temp.change_role(tests.user('na:owner'), tests.id('na'), tests.id('na:dmo'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('na') and r.system_key = 'employee'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('na') and m.user_id = tests.user('na:mov')), tests.id('na:K'));
select pg_temp.change_role(tests.user('na:owner'), tests.id('na'), tests.id('na:lim'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('na') and r.name = 'no announcements'));
select pg_temp.change_role(tests.user('na:owner'), tests.id('na'), tests.id('na:adm'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('na') and r.system_key = 'manager'));
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('na:owner'), tests.id('na'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('na:owner'), tests.id('na'), id);
select public.set_document_publication_service(tests.user('na:owner'), tests.id('na'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- The card asks everybody for it, Gon too, while he is still a member: read before his access goes.
select is(tests.unlisted_notices(tests.id('na'), array(select id from checked)), '{}'::text[],
  '(f) the card''s notices are in their recipients'' choices, read before Gon''s access goes (BILDIRIM-12)');
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('na');
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('na:blk');
select public.remove_employee_access_service(tests.user('na:owner'), tests.id('na'), tests.id('na:gon'));
select is(
  (select array_agg(person || ' ' || coalesce(app_private.authz_reason(tests.user('na:' || person), tests.id('na'), 'announcement.write',
     array[tests.id('na:K')]), 'ok') order by person) from late where person not in ('owner', 'adm', 'veli')),
  array['ayse ok', 'blk document_blocked', 'dmo missing_permission', 'gon not_active', 'lim missing_permission', 'mov out_of_scope'],
  '(f) the core: Ayse may write at Kadikoy; the five may not');

create function pg_temp.failed(id uuid) returns text[] language sql stable as $$
  select pg_temp.told('announcements.publish_failed', id)
$$;
-- ponytail: each post is due now and its day moved to yesterday, so it starts before it can go out. Veli's
-- waits until Besiktas is archived.
update public.announcements set publish_at = now() - interval '1 minute', starts_on = current_date - 1
where id in (select id from late where person <> 'veli');
select app_private.announcement_release(tests.id('na'));
update public.locations set archived_at = now(), updated_at = now() where id = tests.id('na:B');
update public.announcements set publish_at = now() - interval '1 minute', starts_on = current_date - 1
where id = (select id from late where person = 'veli');
select app_private.announcement_release(tests.id('na'));
select is((select array_agg(a.status::text || ' ' || (a.release_failed_at is not null)::text) from public.announcements a
           where a.id in (select id from late)), array_fill('scheduled true'::text, array[9]), '(f) none of the nine went out');
select is(pg_temp.failed((select id from late where person = 'ayse')), array['na:ayse'],
  '(f) Ayse''s tells Ayse, who scheduled it and still may write there');
select is(
  (select array_agg(person || ': ' || array_to_string(pg_temp.failed(id), ',') order by person) from late
   where person not in ('ayse', 'owner', 'adm', 'veli')),
  array['blk: na:adm,na:ayse,na:owner,na:zeynep', 'dmo: na:adm,na:ayse,na:owner,na:zeynep', 'gon: na:adm,na:ayse,na:owner,na:zeynep',
        'lim: na:adm,na:ayse,na:owner,na:zeynep', 'mov: na:adm,na:ayse,na:owner,na:zeynep'],
  '(f) one whose scheduler may no longer write there tells who may (Adm is a Kadikoy manager now), never the scheduler');
select is(
  (select array_agg(person || ': ' || array_to_string(pg_temp.failed(id), ',') order by person) from late
   where person in ('owner', 'adm', 'veli')),
  array['adm: na:owner,na:zeynep', 'owner: na:owner', 'veli: na:owner,na:zeynep'],
  '(f) two places: the owner''s own tells the owner; the demoted admin''s tells who may write at both; Besiktas archived: the owner and Zeynep, never nobody');
select ok((select bool_and(n.title = 'Couldn''t publish "Deep clean by ayse"' and n.body = 'Its day started before it could go out.')
           from public.person_notifications n where n.type_key = 'announcements.publish_failed'
             and n.subject_id = (select id from late where person = 'ayse')), '(f) saying which post, and why');
select app_private.announcement_release(tests.id('na'));
select is((select count(*)::integer from public.person_notifications where type_key = 'announcements.publish_failed'
           and workspace_id = tests.id('na')), 26,
  '(f) once: the next minute does not tell again');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'announcements.published'
           and n.subject_id in (select id from late)), 0, '(f) its audience hears nothing of it');
select pg_temp.save('ayse', (select id from late where person = 'ayse'), pg_temp.payload(array['K'], 'Deep clean by ayse',
  jsonb_build_object('starts_on', current_date + 12, 'publish_at', now() + interval '1 hour')), 'schedule');
select is((select n.resolution from public.person_notifications n where n.type_key = 'announcements.publish_failed'
           and n.subject_id = (select id from late where person = 'ayse')), 'closed',
  '(f) scheduled again: its card closes');

select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('nx')), 0,
  'another workspace hears nothing of this one');
select is(tests.unlisted_notices(tests.id('na'), array(select id from checked)), '{}'::text[],
  'every notice written since is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;
