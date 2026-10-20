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

-- BILDIRIM-U4b (KARARLAR S-123, S-126 (5), S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.1 #6, §2.5 #28-33):
-- role, access and ownership write their own notices into the new core.
--   (a) a role changed tells the person, once; never who changed it;
--   (b) access ended (removed, employment ended, archived) tells the person, who is no longer a member, once,
--       by email too; employment ended leaves shifts without anyone: who may publish there now is told;
--   (c) access restored tells the person and who may publish at their locations;
--   (d) somebody left without a location tells who may end their employment; their card closes when they
--       work somewhere again; the shifts it opened are told like (b)'s;
--   (e) an ownership transfer tells the other side at each step: asked, declined, cancelled, accepted; the
--       asked card closes when it is answered or cancelled;
--   (f) the five-cell probe on who may publish: a manager made an employee, moved off the location, whose role
--       has no publishing, missing a required document, whose access was removed: none of them is told.

select tests.world('pa');
select tests.world('px');
select tests.person('pa', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('pa', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pa', 'veli', 'manager', array['B'], array['cook']);
select tests.person('pa', 'emre', 'employee', array['K'], array['cook']);
select tests.person('pa', 'deniz', 'employee', array['B'], array['cook']);
select tests.person('pa', 'kim', 'employee', array['K'], array['cook']);
select tests.person('pa', 'arc', 'employee', array['K'], array['cook']);
select tests.person('pa', 'solo', 'employee', array['K'], array['cook']);
-- The five who will lose the right to publish at Kadikoy, in (f).
select tests.person('pa', 'dmo', 'manager', array['K'], array['cook']);
select tests.person('pa', 'mov', 'manager', array['K', 'B'], array['cook']);
select tests.person('pa', 'lim', 'manager', array['K'], array['cook']);
select tests.person('pa', 'blk', 'manager', array['K'], array['cook']);
select tests.person('pa', 'gon', 'manager', array['K'], array['cook']);
select tests.person('pa', 'end', 'employee', array['K'], array['cook']);
-- A second admin, who ends Mio's employment in (f); Nob, invited and never joined, in (d).
select tests.person('pa', 'adi', 'admin', array['K'], array['server']);
select tests.person('pa', 'nob', 'employee', array['K'], array['cook'], 'pending');
-- Moda (M) has no manager: its shifts are the admins' and the owner's.
select tests.as_browser(tests.user('pa:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Moda', 'MDA', '3 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul')$sql$,
  tests.remember('pa:M', gen_random_uuid()), tests.id('pa')));
select tests.person('pa', 'mio', 'employee', array['M'], array['cook']);
select tests.person('pa', 'rem', 'employee', array['M'], array['cook']);
-- Nisantasi (N) and Pendik (P) have one manager each: Nur will miss a required document, Pam will lose her
-- access; then their shifts fall to the admins and owner, in (f).
select tests.as_browser(tests.user('pa:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Nisantasi', 'NST', '4 Abdi Ipekci', 'Istanbul', 'Istanbul', '34367', 'Europe/Istanbul'),
              (%L, %L, 'Pendik', 'PDK', '5 Sahil Yolu', 'Istanbul', 'Istanbul', '34890', 'Europe/Istanbul')$sql$,
  tests.remember('pa:N', gen_random_uuid()), tests.id('pa'), tests.remember('pa:P', gen_random_uuid()), tests.id('pa')));
select tests.person('pa', 'nur', 'manager', array['N'], array['cook']);
select tests.person('pa', 'nia', 'employee', array['N'], array['cook']);
select tests.person('pa', 'pam', 'manager', array['P'], array['cook']);
select tests.person('pa', 'pia', 'employee', array['P'], array['cook']);

create temp table who as select label, tests.user(label) uid
from unnest(array['pa:owner', 'pa:zeynep', 'pa:ayse', 'pa:veli', 'pa:emre', 'pa:deniz', 'pa:kim', 'pa:arc', 'pa:solo',
  'pa:dmo', 'pa:mov', 'pa:lim', 'pa:blk', 'pa:gon', 'pa:end', 'pa:adi', 'pa:mio', 'pa:nur', 'pa:nia', 'pa:pam', 'pa:pia',
  'px:owner']) label;
-- Who was told about one notice (by its title).
create function pg_temp.told_titled(type_key text, title text) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told_titled.type_key and n.title = told_titled.title and n.workspace_id = tests.id('pa')
$$;
create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('pa:' || person)
$$;
create function pg_temp.told(type_key text) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told.type_key and n.workspace_id = tests.id('pa')
$$;
create function pg_temp.k_zone() returns text language sql stable as $$
  select l.timezone from public.locations l where l.id = tests.id('pa:K')
$$;
create function pg_temp.terminate(person text, actor text default 'owner') returns jsonb language sql as $$
  select public.terminate_employee_service(pg_temp.u(actor), tests.id('pa'), tests.id('pa:' || person),
    (now() at time zone pg_temp.k_zone())::timestamp, pg_temp.k_zone(), 'Moved away', gen_random_uuid())
$$;
select tests.publish_week('pa', 1, $$[
  {"label": "kim_tue", "person": "kim", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "kim_wed", "person": "kim", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "solo_tue", "person": "solo", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "end_thu", "person": "end", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "mio_fri", "person": "mio", "loc": "M", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "rem_sat", "person": "rem", "loc": "M", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"},
  {"label": "nia_fri", "person": "nia", "loc": "N", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "pia_fri", "person": "pia", "loc": "P", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}
]$$::jsonb);
-- The world's notices so far are in their recipients' choices, read before Kim and the others leave (BILDIRIM-12).
select is(tests.unlisted_notices(tests.id('pa')), '{}'::text[], 'the world''s notices are in their recipients'' choices');
create temp table checked as select n.id from public.person_notifications n where n.workspace_id = tests.id('pa');

-- (a) A role changed ----------------------------------------------------------------------------------------

select pg_temp.change_role(pg_temp.u('owner'), tests.id('pa'), tests.id('pa:emre'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('pa') and r.system_key = 'manager'));
select is(pg_temp.told('people.role_changed'), array['pa:emre'], '(a) Emre, made a manager, is told; the owner is not');
-- DAVET-ERISIM: an access change tells it in one title; which access it is now travels in the notice's data.
select is((select (n.title, n.data ->> 'management_role_id')::text from public.person_notifications n
           where n.type_key = 'people.role_changed' and n.user_id = pg_temp.u('emre')),
  (select ('Your access changed', r.id)::text from public.workspace_roles r
   where r.workspace_id = tests.id('pa') and r.system_key = 'manager'), '(a) saying which');
-- The same role given again changes nothing, and tells nothing.
select pg_temp.change_role(pg_temp.u('owner'), tests.id('pa'), tests.id('pa:emre'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('pa') and r.system_key = 'manager'));
select is(pg_temp.told('people.role_changed'), array['pa:emre'], '(a) given the same role again: not told again');
select is(app_private.account_name(gen_random_uuid()), 'Somebody', '(a) an account without a profile is named Somebody');

-- (b) Access ended ------------------------------------------------------------------------------------------

select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('pa'), tests.id('pa:deniz'));
select is(pg_temp.told('people.access_ended'), array['pa:deniz'], '(b) Deniz''s access removed: Deniz is told, though no longer a member');
select is((select count(*)::integer from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
           where n.type_key = 'people.access_ended' and n.user_id = pg_temp.u('deniz') and d.channel = 'email'), 1,
  '(b) by email, the only way that still reaches him');
select pg_temp.terminate('kim');
select is(pg_temp.told('people.access_ended'), array['pa:deniz', 'pa:kim'], '(b) Kim''s employment ended: Kim is told, once');
create function pg_temp.unassigned() returns text[] language sql stable as $$
  select pg_temp.told('schedule.shifts_unassigned')
$$;
select is(pg_temp.unassigned(), array['pa:ayse', 'pa:blk', 'pa:dmo', 'pa:emre', 'pa:gon', 'pa:lim', 'pa:mov'],
  '(b) Kim''s two Kadikoy shifts are left without anyone: Kadikoy''s managers are told; not the admins or owner while it has managers, not Besiktas, not Kim');
select is((select array_agg(distinct jsonb_array_length(n.data -> 'shift_ids')) from public.person_notifications n
           where n.type_key = 'schedule.shifts_unassigned' and n.workspace_id = tests.id('pa')), array[2], '(b) the card lists Kadikoy''s two');
select ok((select bool_and(n.title = '2 shifts at Kadikoy have nobody') from public.person_notifications n
           where n.type_key = 'schedule.shifts_unassigned' and n.workspace_id = tests.id('pa')), '(b) saying how many and where');
select public.set_employee_archived_service(pg_temp.u('owner'), tests.id('pa'), tests.id('pa:arc'), true);
select is(pg_temp.told('people.access_ended'), array['pa:arc', 'pa:deniz', 'pa:kim'], '(b) Arc archived: Arc is told');

-- (c) Access restored ---------------------------------------------------------------------------------------

select public.set_employee_archived_service(pg_temp.u('owner'), tests.id('pa'), tests.id('pa:arc'), false, true);
select is(pg_temp.told('people.restored'), array['pa:arc', 'pa:ayse', 'pa:blk', 'pa:dmo', 'pa:emre', 'pa:gon', 'pa:lim', 'pa:mov'],
  '(c) Arc restored: Arc and Kadikoy''s managers are told; not the admins or owner while it has managers, not Besiktas');
select is((select n.title from public.person_notifications n where n.type_key = 'people.restored' and n.user_id = pg_temp.u('arc')),
  'Your access is back', '(c) Arc hears it is back');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.restored'
           and n.user_id = pg_temp.u('ayse')), 1, '(c) once each');

-- (d) Left without a location -------------------------------------------------------------------------------

select public.remove_employee_from_location_service(pg_temp.u('ayse'), tests.id('pa'), tests.id('pa:solo'), tests.id('pa:K'));
select is(pg_temp.told('people.no_location'), array['pa:adi', 'pa:owner', 'pa:zeynep'],
  '(d) Solo has no location left: who may end his employment is told, the owner and the admins; not Ayse who removed him');
select ok((select bool_and(n.title = 'Solo Person has no location') from public.person_notifications n
           where n.type_key = 'people.no_location'), '(d) saying who');
select is(pg_temp.told_titled('schedule.shifts_unassigned', '1 shift at Kadikoy has nobody'),
  array['pa:blk', 'pa:dmo', 'pa:emre', 'pa:gon', 'pa:lim', 'pa:mov'],
  '(d) his Kadikoy shift left open is told to Kadikoy''s other managers; not Ayse who removed him');
select tests.works_at((select m.id from public.workspace_memberships m where m.workspace_id = tests.id('pa')
  and m.user_id = pg_temp.u('solo')), tests.id('pa:B'));
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.no_location'
           and n.resolved_at is null), 0, '(d) he works at Besiktas now: the cards close');
-- An unassigned card closes once its shifts are given to somebody (plan §2.1 row 6). Solo's one shift is taken
-- by Emre; Kim's two go to Emre in Kadikoy's week published again.
create function pg_temp.unassigned_open(title text) returns integer language sql stable as $$
  select count(*)::integer from public.person_notifications n where n.type_key = 'schedule.shifts_unassigned'
  and n.workspace_id = tests.id('pa') and n.title = unassigned_open.title and n.resolved_at is null
$$;
-- ponytail: given straight on the published row, as an approved pickup or cover does.
update public.schedule_published_shifts set employee_id = tests.id('pa:emre') where id = tests.id('pa:shift:solo_tue');
select is(pg_temp.unassigned_open('1 shift at Kadikoy has nobody'), 0, '(d) Solo''s shift taken by Emre: its card closes');
select is(pg_temp.unassigned_open('2 shifts at Kadikoy have nobody'), 7, '(d) Kim''s two still have nobody: theirs stays open');
update public.schedule_published_shifts set employee_id = tests.id('pa:emre') where id = tests.id('pa:shift:kim_tue');
select is(pg_temp.unassigned_open('2 shifts at Kadikoy have nobody'), 7, '(d) one of Kim''s two given: still open');
update public.schedule_published_shifts set employee_id = tests.id('pa:emre') where id = tests.id('pa:shift:kim_wed');
select is(pg_temp.unassigned_open('2 shifts at Kadikoy have nobody'), 0, '(d) both given: Kim''s card closes');

-- Nob, invited and never joined, has no account: removed from Kadikoy, then archived, his cards close all the same.
select public.remove_employee_from_location_service(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:nob'), tests.id('pa:K'));
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.no_location'
           and n.subject_id = tests.id('pa:nob') and n.resolved_at is null), 2, '(d) Nob has no location: the owner''s and Adi''s cards open');
select public.set_employee_archived_service(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:nob'), true);
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'people.no_location'
           and n.subject_id = tests.id('pa:nob') and n.resolved_at is null), 0, '(d) archived without an account: they close');

-- (e) Ownership ---------------------------------------------------------------------------------------------

create function pg_temp.offer() returns uuid language sql as $$
  select (public.initiate_workspace_ownership_transfer_service(pg_temp.u('owner'), tests.id('pa'), pg_temp.u('zeynep'))
    ->> 'transfer_id')::uuid
$$;
create temp table offers (step text, id uuid);
insert into offers select 'declined', pg_temp.offer();
select is(pg_temp.told('people.ownership_transfer_requested'), array['pa:zeynep'], '(e) Zeynep is asked; the owner is not told');
select public.respond_workspace_ownership_transfer_service(pg_temp.u('zeynep'), tests.id('pa'), (select id from offers where step = 'declined'), 'reject');
select is(pg_temp.told('people.ownership_transfer_answered'), array['pa:owner'], '(e) she declines: the owner hears it');
select is((select n.resolution from public.person_notifications n where n.type_key = 'people.ownership_transfer_requested'
           and n.subject_id = (select id from offers where step = 'declined')), 'declined', '(e) and her card closes');
insert into offers select 'cancelled', pg_temp.offer();
select public.cancel_workspace_ownership_transfer_service(pg_temp.u('owner'), tests.id('pa'), (select id from offers where step = 'cancelled'));
select is(pg_temp.told('people.ownership_transfer_answered'), array['pa:owner', 'pa:zeynep'], '(e) the owner cancels: Zeynep hears it');
select is((select n.resolution from public.person_notifications n where n.type_key = 'people.ownership_transfer_requested'
           and n.subject_id = (select id from offers where step = 'cancelled')), 'cancelled', '(e) and her card closes');
insert into offers select 'accepted', pg_temp.offer();
select public.respond_workspace_ownership_transfer_service(pg_temp.u('zeynep'), tests.id('pa'), (select id from offers where step = 'accepted'), 'accept');
select is(pg_temp.told('people.ownership_transfer_answered'), array['pa:owner', 'pa:owner', 'pa:zeynep'],
  '(e) she accepts: the former owner hears it, once');
select is((select n.resolution from public.person_notifications n where n.type_key = 'people.ownership_transfer_requested'
           and n.subject_id = (select id from offers where step = 'accepted')), 'accepted', '(e) and her card closes');

-- Every notice so far is in its recipient's choices, read before anyone loses a right (BILDIRIM-12).
select is(tests.unlisted_notices(tests.id('pa'), array(select id from checked) || array(select n.id from public.person_notifications n
  where n.workspace_id = tests.id('pa') and n.type_key = 'people.access_ended')), '{}'::text[],
  'so far every notice is in its recipient''s choices (BILDIRIM-12); access ended goes to former members by design');
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('pa');

-- (g) The access work outlives its notices ---------------------------------------------------------------
-- With the core's write (notify_rows), its card close (notification_resolve) or its holder list
-- (notify_holders) broken in turn, every path still completes: a role changed, access removed, employment
-- ended, archived and restored, a last location taken, an ownership transfer asked, declined, asked and
-- cancelled. The failure is logged; the work stands.

select tests.person('pa', kind || tag, 'employee', array['K'], array['cook'])
from unnest(array['role', 'rm', 'term', 'arc', 'loc']) kind, unnest(array['r', 'c', 'h']) tag;
insert into who select 'pa:' || kind || tag, tests.user('pa:' || kind || tag)
from unnest(array['role', 'rm', 'term', 'arc', 'loc']) kind, unnest(array['r', 'c', 'h']) tag;
create temp table outlived (broken text, done text);
create function pg_temp.paths(broken text, tag text) returns void language plpgsql as $$
declare
  w uuid := tests.id('pa');
  boss uuid := pg_temp.u('zeynep');
  offer uuid;
begin
  perform pg_temp.change_role(boss, w, tests.id('pa:role' || tag),
    (select r.id from public.workspace_roles r where r.workspace_id = w and r.system_key = 'manager'));
  perform public.remove_employee_access_service(boss, w, tests.id('pa:rm' || tag));
  perform public.terminate_employee_service(boss, w, tests.id('pa:term' || tag),
    (now() at time zone pg_temp.k_zone())::timestamp, pg_temp.k_zone(), 'Moved away', gen_random_uuid());
  perform public.set_employee_archived_service(boss, w, tests.id('pa:arc' || tag), true);
  perform public.set_employee_archived_service(boss, w, tests.id('pa:arc' || tag), false, true);
  perform public.remove_employee_from_location_service(boss, w, tests.id('pa:loc' || tag), tests.id('pa:K'));
  offer := (public.initiate_workspace_ownership_transfer_service(boss, w, pg_temp.u('owner')) ->> 'transfer_id')::uuid;
  perform public.respond_workspace_ownership_transfer_service(pg_temp.u('owner'), w, offer, 'reject');
  offer := (public.initiate_workspace_ownership_transfer_service(boss, w, pg_temp.u('owner')) ->> 'transfer_id')::uuid;
  perform public.cancel_workspace_ownership_transfer_service(boss, w, offer);
  insert into outlived values (broken, (
    select string_agg(x, ' | ' order by n) from (values
      (1, (select r.system_key::text from public.workspace_memberships m join public.workspace_roles r on r.id = m.role_id
           where m.workspace_id = w and m.user_id = tests.user('pa:role' || tag))),
      (2, (select m.status::text from public.workspace_memberships m where m.workspace_id = w and m.user_id = tests.user('pa:rm' || tag))),
      (3, (select (e.archived_at is not null)::text from public.employee_profiles e where e.id = tests.id('pa:term' || tag))),
      (4, (select m.status::text from public.workspace_memberships m where m.workspace_id = w and m.user_id = tests.user('pa:arc' || tag))),
      (5, (select count(*)::text from public.employee_location_assignments a where a.employee_id = tests.id('pa:loc' || tag) and a.ended_at is null)),
      (6, (select string_agg(distinct t.status::text, ',' order by t.status::text) from public.workspace_ownership_transfers t
           where t.workspace_id = w and t.initiated_by = boss))
    ) v(n, x)));
exception when others then
  insert into outlived values (broken, 'died: ' || sqlerrm);
end $$;
create temp table core_saved as select p.proname, pg_get_functiondef(p.oid) def from pg_proc p
where p.pronamespace = 'app_private'::regnamespace and p.proname in ('notify_rows', 'notification_resolve', 'notify_holders');
create function pg_temp.restore_core() returns void language plpgsql as $$
declare d text;
begin
  for d in select def from core_saved loop execute d; end loop;
end $$;
create or replace function app_private.notify_rows(target_workspace uuid, target_actor uuid, target_rows jsonb)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'notices are down'; end $$;
select pg_temp.paths('notify_rows', 'r');
select pg_temp.restore_core();
create or replace function app_private.notification_resolve(target_workspace uuid, target_subject_type text, target_subject_id uuid,
  target_resolution text, target_resolved_by uuid)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'closing is down'; end $$;
select pg_temp.paths('notification_resolve', 'c');
select pg_temp.restore_core();
create or replace function app_private.notify_holders(target_workspace uuid, target_action text, target_places uuid[] default null,
  target_person uuid default null)
returns uuid[] language plpgsql set search_path = '' as $$ begin raise exception 'holders are down'; end $$;
select pg_temp.paths('notify_holders', 'h');
select pg_temp.restore_core();
select is((select array_agg(broken || ': ' || done order by broken) from outlived),
  array['notification_resolve: manager | suspended | true | active | 0 | cancelled,rejected',
        'notify_holders: manager | suspended | true | active | 0 | cancelled,rejected',
        'notify_rows: manager | suspended | true | active | 0 | cancelled,rejected'],
  '(g) with notices, card closes or holder lists down, every access path completes');
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('pa');

-- (f) Who may publish, five cells -------------------------------------------------------------------------
-- Dmo is made an employee, Mov leaves Kadikoy, Lim's role loses publishing, Blk misses a required document,
-- Gon's access is removed. Then End's employment ends and his Kadikoy shift has nobody.

select tests.role('pa', 'no publishing', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('pa') and r.system_key = 'manager' and rp.permission_key <> 'schedule.publish'));
select pg_temp.change_role(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:dmo'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('pa') and r.system_key = 'employee'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('pa') and m.user_id = pg_temp.u('mov')), tests.id('pa:K'));
select pg_temp.change_role(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:lim'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('pa') and r.name = 'no publishing'));
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(pg_temp.u('zeynep'), tests.id('pa'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(pg_temp.u('zeynep'), tests.id('pa'), id);
select public.set_document_publication_service(pg_temp.u('zeynep'), tests.id('pa'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('pa') on conflict do nothing;
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = pg_temp.u('blk');
select public.remove_employee_access_service(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:gon'));
select is(
  (select array_agg(person || ' ' || coalesce(app_private.authz_reason(pg_temp.u(person), tests.id('pa'), 'schedule.publish',
     array[tests.id('pa:K')]), 'ok') order by person) from unnest(array['ayse', 'blk', 'dmo', 'gon', 'lim', 'mov']) person),
  array['ayse ok', 'blk document_blocked', 'dmo missing_permission', 'gon not_active', 'lim missing_permission', 'mov out_of_scope'],
  '(f) the core: Ayse may publish at Kadikoy; the five may not');
delete from public.person_notifications where type_key = 'schedule.shifts_unassigned' and workspace_id = tests.id('pa');
select pg_temp.terminate('end', 'zeynep');
select is(pg_temp.unassigned(), array['pa:ayse', 'pa:emre', 'pa:rolec', 'pa:roleh', 'pa:roler'],
  '(f) End''s shift has nobody: Kadikoy''s managers who may publish are told (Ayse, Emre, the three made managers in (g)); none of the five, not the admins or owner');
-- Kadikoy's week published again: End's card closes; Moda's (Mio's, below) is another location's.
select tests.publish_week('pa', 1, $$[
  {"label": "end_thu", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]$$::jsonb);
select is(pg_temp.unassigned_open('1 shift at Kadikoy has nobody'), 0, '(f) Kadikoy''s week published again: End''s card closes');
-- Moda has no manager: Mio's shift left without anyone goes to the admins and the owner.
delete from public.person_notifications where type_key = 'schedule.shifts_unassigned' and workspace_id = tests.id('pa');
select pg_temp.terminate('mio', 'adi');
select is(pg_temp.unassigned(), array['pa:owner', 'pa:zeynep'],
  '(f) Mio''s Moda shift has nobody and Moda no manager: the owner and the admins are told, not Adi who ended it');
-- Nur, Nisantasi's only manager, misses a required document; Pam, Pendik's, loses her access: their shifts
-- fall to the admins and owner.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = pg_temp.u('nur');
select public.remove_employee_access_service(pg_temp.u('zeynep'), tests.id('pa'), tests.id('pa:pam'));
select pg_temp.terminate('nia', 'adi');
select pg_temp.terminate('pia', 'adi');
select is(pg_temp.told_titled('schedule.shifts_unassigned', '1 shift at Nisantasi has nobody'), array['pa:owner', 'pa:zeynep'],
  '(f) Nia''s Nisantasi shift: its only manager missing a document, the owner and the admins are told, not Nur');
select is(pg_temp.told_titled('schedule.shifts_unassigned', '1 shift at Pendik has nobody'), array['pa:owner', 'pa:zeynep'],
  '(f) Pia''s Pendik shift: its only manager''s access removed, the owner and the admins are told, not Pam');
-- Another location's card is untouched by Kadikoy's republish and by these.
select is(pg_temp.unassigned_open('1 shift at Moda has nobody'), 2, '(f) Moda''s card stays open');
-- Rem leaves Moda: his shift there has nobody, a second Moda card. A closed day removes that shift outright
-- (announcement_apply; Mio's, tied to his offboarding, it may not): Rem's card closes, Mio's stays.
select public.remove_employee_from_location_service(pg_temp.u('adi'), tests.id('pa'), tests.id('pa:rem'), tests.id('pa:M'));
select is(pg_temp.unassigned_open('1 shift at Moda has nobody'), 4, '(f) two Moda cards open, Mio''s and Rem''s');
-- ponytail: removed straight from the published row, as announcement_apply does for a closed day.
delete from public.schedule_published_shifts where id = tests.id('pa:shift:rem_sat');
select is(pg_temp.unassigned_open('1 shift at Moda has nobody'), 2, '(f) Rem''s shift removed by a closed day: his card closes, Mio''s stays');

select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('px')), 0,
  'another workspace hears nothing of this one');
select is(tests.unlisted_notices(tests.id('pa'), array(select id from checked) || array(select n.id from public.person_notifications n
  where n.workspace_id = tests.id('pa') and n.type_key = 'people.access_ended')), '{}'::text[],
  'every notice written since is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;
