begin;
create extension if not exists pgtap with schema extensions;
select plan(99);

-- A person's avatar is one per workspace membership: a photo they uploaded or a drawing from the
-- Lineup archive, never both (AVATAR-IKON, design §4.3-4.5, §4.7). The account keeps a "last avatar"
-- that points at where it came from, never a copy: a drawing's key, or the membership whose photo it
-- was. A manager removes only a photo the person uploaded, and a removed photo is never suggested again.

select tests.world('a');
select tests.world('b');
select tests.person('a', 'ali', 'employee', array['K'], array['server']);
select tests.person('a', 'cem', 'employee', array['K'], array['cook', 'server']);
select tests.person('a', 'emre', 'employee', array['K'], array['cook']);
select tests.person('a', 'mo', 'manager', array['K'], array['cook']);
select tests.person('a', 'mb', 'manager', array['B'], array['cook']);
select tests.person('a', 'sus', 'employee', array['K'], array['cook'], 'suspended');

-- Ali joins workspace b too, as an employee who has not finished onboarding there.
create function pg_temp.join_world(w text, person_label text) returns uuid language plpgsql as $$
declare
  account uuid := tests.user('a:' || person_label);
  created jsonb;
begin
  created := public.create_employee_command_service(
    tests.user(w || ':owner'), tests.id(w), gen_random_uuid(),
    jsonb_build_object(
      'first_name', initcap(person_label), 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
      'invitation_email', (select u.email from auth.users u where u.id = account),
      'start_date', '', 'internal_note', '',
      'location_ids', jsonb_build_array(tests.id(w || ':K')), 'primary_location_id', tests.id(w || ':K'),
      'job_ids', jsonb_build_array(tests.id(w || ':job:cook')), 'primary_job_id', tests.id(w || ':job:cook'),
      'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id(w) and r.system_key = 'employee'));
  perform public.accept_employee_invitation_by_id_service(account, (created ->> 'invitation_id')::uuid);
  perform tests.settle();
  return (created ->> 'id')::uuid;
end;
$$;
select tests.remember('b:ali', pg_temp.join_world('b', 'ali'));

-- Gus manages in workspace a with no employee record at all: a membership in the management slot only.
select tests.new_user('a:gus', 'Gus Person');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id)
select tests.id('a'), tests.user('a:gus'), 'active',
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('a') and r.system_key = 'manager');

create temporary table who (label text primary key, user_id uuid, membership uuid, workspace uuid);
insert into who
select x.label, tests.user(x.account), m.id, m.workspace_id
from (values ('ali@a', 'a:ali', 'a'), ('ali@b', 'a:ali', 'b'), ('cem@a', 'a:cem', 'a'), ('mo@a', 'a:mo', 'a'),
             ('gus@a', 'a:gus', 'a'), ('sus@a', 'a:sus', 'a')) x(label, account, w)
join public.workspace_memberships m on m.workspace_id = tests.id(x.w) and m.user_id = tests.user(x.account);

create function pg_temp.m(label text) returns uuid language sql stable as $$ select membership from who where who.label = m.label $$;
create function pg_temp.u(label text) returns uuid language sql stable as $$ select user_id from who where who.label = u.label $$;
-- A photo path in a membership's own place: <workspace>/<membership>/<uuid>.<ext>.
create function pg_temp.photo(label text, ext text default 'jpg') returns text language sql volatile as $$
  select workspace || '/' || membership || '/' || gen_random_uuid() || '.' || ext from who where who.label = photo.label $$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;

create temporary table photos (label text primary key, path text);
insert into photos values ('ali-1', pg_temp.photo('ali@a')), ('ali-2', pg_temp.photo('ali@a', 'png')),
  ('ali-3', pg_temp.photo('ali@a', 'webp')), ('mo-1', pg_temp.photo('mo@a')), ('ali-b', pg_temp.photo('ali@b'));
create function pg_temp.p(label text) returns text language sql stable as $$ select path from photos where photos.label = p.label $$;

-- The shape ------------------------------------------------------------------------------------------

select has_table('public', 'member_avatars', 'a membership''s avatar has its own table');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.member_avatars'::regclass),
  'row level security is on for member_avatars');
select is((select count(*)::integer from pg_policy p where p.polrelid = 'public.member_avatars'::regclass), 0,
  'member_avatars has no policy: the services read and write it');
select ok(not has_table_privilege('authenticated', 'public.member_avatars', 'SELECT')
  and not has_table_privilege('authenticated', 'public.member_avatars', 'INSERT')
  and not has_table_privilege('anon', 'public.member_avatars', 'SELECT'),
  'the browser holds nothing on member_avatars');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'app_private.last_avatars'::regclass)
  and not has_table_privilege('authenticated', 'app_private.last_avatars', 'SELECT'),
  'the last avatar is private to the services');
select is(
  (select row(a.scope_class, a.effect, a.permission_key, a.restricted_ok)::text from app_private.authz_actions a where a.key = 'avatar.self'),
  row('own', 'write', null::text, true)::text,
  'avatar.self is one''s own, needs no permission and is open while onboarding');
select is(
  array(select format('%s %s', p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or has_function_privilege('anon', p.oid, 'EXECUTE'))
        from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('get_own_avatar_service', 'save_own_avatar_service', 'remove_own_avatar_service',
                            'get_last_avatar_service', 'get_member_avatar_service', 'remove_member_photo_service')
        order by 1),
  array['get_last_avatar_service f', 'get_member_avatar_service f', 'get_own_avatar_service f',
        'remove_member_photo_service f', 'remove_own_avatar_service f', 'save_own_avatar_service f'],
  'the six avatar services exist and the browser cannot call them');
select ok(
  (select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('get_own_avatar_service', 'save_own_avatar_service', 'remove_own_avatar_service',
                       'get_last_avatar_service', 'get_member_avatar_service', 'remove_member_photo_service')),
  'the API calls them as service_role');

-- save_art_then_photo --------------------------------------------------------------------------------

select is(public.get_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')) -> 'kind', 'null'::jsonb,
  'save_art_then_photo: nobody starts with an avatar');
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), '{"art_key": "003-bartender"}'),
  '{"previous_photo_path": null}'::jsonb, 'save_art_then_photo: a drawing is saved, no photo to clean up');
select is((select row(art_key, photo_path)::text from public.member_avatars where membership_id = pg_temp.m('ali@a')),
  row('003-bartender', null::text)::text, 'save_art_then_photo: the row holds the drawing only');
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-1'))),
  '{"previous_photo_path": null}'::jsonb, 'save_art_then_photo: a photo replaces the drawing');
select is((select row(art_key, photo_path)::text from public.member_avatars where membership_id = pg_temp.m('ali@a')),
  row(null::text, pg_temp.p('ali-1'))::text, 'save_art_then_photo: the row holds the photo only');
select is(public.get_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')) - 'suggested',
  jsonb_build_object('kind', 'photo', 'art_key', null, 'photo_path', pg_temp.p('ali-1')),
  'save_art_then_photo: the person reads their photo');
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-2'))),
  jsonb_build_object('previous_photo_path', pg_temp.p('ali-1')), 'a new photo hands back the old one to delete');
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-2'))),
  '{"previous_photo_path": null}'::jsonb, 'saving the same photo again hands back nothing to delete');

-- one_of_two -----------------------------------------------------------------------------------------

select throws_ok(format($$select public.save_own_avatar_service(%L, %L, %L)$$, pg_temp.u('ali@a'), tests.id('a'),
    jsonb_build_object('art_key', '001-server', 'photo_path', pg_temp.p('ali-3'))),
  '23514', null, 'one_of_two: a photo and a drawing together are refused');
select throws_ok(format($$select public.save_own_avatar_service(%L, %L, '{}')$$, pg_temp.u('ali@a'), tests.id('a')),
  '23514', null, 'one_of_two: neither is refused too');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, photo_path, art_key) values (%L, %L, %L, '001-server')$$,
    pg_temp.m('cem@a'), tests.id('a'), pg_temp.photo('cem@a')),
  '23514', null, 'one_of_two: the table itself refuses both');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, photo_path) values (%L, %L, %L)$$,
    pg_temp.m('cem@a'), tests.id('a'), pg_temp.p('mo-1')),
  '23514', null, 'the table refuses a photo path outside the row''s own membership');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, photo_path) values (%L, %L, %L)$$,
    pg_temp.m('cem@a'), tests.id('a'), tests.id('a') || '/' || pg_temp.m('cem@a') || '/photo.jpg'),
  '23514', null, 'the table refuses a free-form file name');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, photo_path) values (%L, %L, %L)$$,
    pg_temp.m('cem@a'), tests.id('a'), tests.id('a') || '/' || pg_temp.m('cem@a') || '/' || gen_random_uuid() || '.gif'),
  '23514', null, 'the table refuses a format that is not JPG, PNG or WebP');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, art_key) values (%L, %L, 'no-such-drawing')$$,
    pg_temp.m('cem@a'), tests.id('a')),
  '23503', null, 'a drawing must be in the archive');
select throws_ok(format($$insert into public.member_avatars (membership_id, workspace_id, art_key) values (%L, %L, '001-server')$$,
    pg_temp.m('cem@a'), tests.id('b')),
  '23503', null, 'a row''s workspace is its membership''s');

-- foreign_prefix_refused -----------------------------------------------------------------------------

select is(pg_temp.refusal(format($$select public.save_own_avatar_service(%L, %L, %L)$$, pg_temp.u('ali@a'), tests.id('a'),
    jsonb_build_object('photo_path', pg_temp.p('mo-1')))),
  '42501 authz.out_of_scope', 'foreign_prefix_refused: another member''s photo path');
select is(pg_temp.refusal(format($$select public.save_own_avatar_service(%L, %L, %L)$$, pg_temp.u('ali@a'), tests.id('a'),
    jsonb_build_object('photo_path', pg_temp.p('ali-b')))),
  '42501 authz.out_of_scope', 'foreign_prefix_refused: one''s own photo from another workspace');
select throws_ok(format($$select public.save_own_avatar_service(%L, %L, %L)$$, pg_temp.u('ali@a'), tests.id('a'),
    jsonb_build_object('photo_path', tests.id('a') || '/' || pg_temp.m('ali@a') || '/../' || pg_temp.m('mo@a') || '/' || gen_random_uuid() || '.jpg')),
  '23514', null, 'a path that starts in one''s own place but climbs out of it is refused');
select throws_ok(format($$select public.save_own_avatar_service(%L, %L, %L)$$, pg_temp.u('ali@a'), tests.id('a'),
    jsonb_build_object('photo_path', tests.id('a') || '/' || pg_temp.m('ali@a') || '/extra/' || gen_random_uuid() || '.jpg')),
  '23514', null, 'a path with an extra folder in one''s own place is refused');
select is((select photo_path from public.member_avatars where membership_id = pg_temp.m('ali@a')), pg_temp.p('ali-2'),
  'a refused save changes nothing');

-- workspace_boundary ---------------------------------------------------------------------------------

select is(public.get_own_avatar_service(pg_temp.u('ali@a'), tests.id('b')) - 'suggested',
  jsonb_build_object('kind', null, 'art_key', null, 'photo_path', null),
  'workspace_boundary: the photo in a is not ali''s avatar in b');
select is(pg_temp.refusal(format($$select public.get_own_avatar_service(%L, %L)$$, tests.user('b:owner'), tests.id('a'))),
  '42501 authz.not_member', 'workspace_boundary: somebody of another workspace reads nothing here');
select is(
  array(select pg_temp.refusal(format(s, tests.user('b:owner'), tests.id('a'))) from unnest(array[
    $$select public.save_own_avatar_service(%L, %L, '{"art_key": "001-server"}')$$,
    $$select public.remove_own_avatar_service(%L, %L)$$,
    $$select public.get_last_avatar_service(%L, %L)$$]) s),
  array['42501 authz.not_member', '42501 authz.not_member', '42501 authz.not_member'],
  'workspace_boundary: nor saves, removes or reads a last avatar there');

-- the person in onboarding, and somebody whose access was taken away ----------------------------------

select is((select status::text from public.workspace_memberships where id = pg_temp.m('ali@b')), 'pending_activation',
  'ali has not finished onboarding in b');
select is(public.save_own_avatar_service(pg_temp.u('ali@b'), tests.id('b'), '{"art_key": "001-server"}'),
  '{"previous_photo_path": null}'::jsonb, 'somebody still onboarding saves their avatar');
select is((select art_key from public.member_avatars where membership_id = pg_temp.m('ali@b')), '001-server',
  'and it is theirs in b only');
insert into public.member_avatars (membership_id, workspace_id, art_key) values (pg_temp.m('sus@a'), tests.id('a'), '002-busser');
select is(
  array(select pg_temp.refusal(format(s, pg_temp.u('sus@a'), tests.id('a'))) from unnest(array[
    $$select public.get_own_avatar_service(%L, %L)$$,
    $$select public.save_own_avatar_service(%L, %L, '{"art_key": "001-server"}')$$,
    $$select public.remove_own_avatar_service(%L, %L)$$,
    $$select public.get_last_avatar_service(%L, %L)$$]) s),
  array['42501 authz.not_active', '42501 authz.not_active', '42501 authz.not_active', '42501 authz.not_active'],
  'a suspended member neither reads nor writes their avatar');
select is((select art_key from public.member_avatars where membership_id = pg_temp.m('sus@a')), '002-busser',
  'and their avatar simply stays');

-- management_only_member -----------------------------------------------------------------------------

select is((select count(*)::integer from public.employee_profiles where workspace_id = tests.id('a') and user_id = pg_temp.u('gus@a')), 0,
  'gus has no employee record');
select is(public.save_own_avatar_service(pg_temp.u('gus@a'), tests.id('a'), '{"art_key": "007-gm"}'),
  '{"previous_photo_path": null}'::jsonb, 'management_only_member: saves a drawing');
select is(public.get_own_avatar_service(pg_temp.u('gus@a'), tests.id('a')),
  jsonb_build_object('kind', 'art', 'art_key', '007-gm', 'photo_path', null, 'suggested', '[]'::jsonb),
  'management_only_member: reads it, with no jobs to suggest from');

-- suggested_from_jobs --------------------------------------------------------------------------------

select ok(cardinality((select lineup_icons from public.jobs where id = tests.id('a:job:server'))) > 0, 'Server has Lineup icons');
select is(public.get_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')) -> 'suggested',
  to_jsonb((select lineup_icons from public.jobs where id = tests.id('a:job:server'))),
  'suggested_from_jobs: a Server is suggested Server''s icons, in order');
update public.jobs set lineup_icons = array['015-line-cook', '001-server'] where id = tests.id('a:job:cook');
update public.jobs set lineup_icons = array['001-server', '027-server-notepad'] where id = tests.id('a:job:server');
select is(public.get_own_avatar_service(pg_temp.u('cem@a'), tests.id('a')) -> 'suggested',
  '["015-line-cook", "001-server", "027-server-notepad"]'::jsonb,
  'two jobs suggest their icons once each, the primary job''s first');

-- last_avatar_points_to_source -----------------------------------------------------------------------

select is(public.get_last_avatar_service(pg_temp.u('ali@b'), tests.id('b')), null::jsonb,
  'the last avatar is never offered back to the workspace it came from');
select is((select row(source_membership_id, art_key)::text from app_private.last_avatars where user_id = pg_temp.u('ali@a')),
  row(pg_temp.m('ali@b'), '001-server')::text, 'the last save (in b, a drawing) is the last avatar');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('a')),
  jsonb_build_object('kind', 'art', 'art_key', '001-server', 'source_photo_path', null, 'from_workspace_name', 'World b'),
  'a drawing chosen while still onboarding in b is offered in a');
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), '{"art_key": "003-bartender"}'),
  jsonb_build_object('previous_photo_path', pg_temp.p('ali-2')), 'back to a drawing in a hands back the photo');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')),
  jsonb_build_object('kind', 'art', 'art_key', '003-bartender', 'source_photo_path', null, 'from_workspace_name', 'World a'),
  'last_avatar_points_to_source: a drawing chosen in a is offered in b with a''s name');
-- A source that is no longer live (suspended, or its workspace closed) offers nothing.
savepoint art_source_suspended;
update public.workspace_memberships set status = 'suspended' where id = pg_temp.m('ali@a');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')), null::jsonb,
  'a drawing chosen in a membership since suspended is not offered');
rollback to savepoint art_source_suspended;
select is(public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-3'))),
  '{"previous_photo_path": null}'::jsonb, 'a photo again in a');
select is((select row(source_membership_id, art_key)::text from app_private.last_avatars where user_id = pg_temp.u('ali@a')),
  row(pg_temp.m('ali@a'), null::text)::text, 'a photo is kept as where it is, not as a copy');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')),
  jsonb_build_object('kind', 'photo', 'art_key', null, 'source_photo_path', pg_temp.p('ali-3'), 'from_workspace_name', 'World a'),
  'last_avatar_points_to_source: a photo in a is offered in b by its path in a');
savepoint photo_source_suspended;
update public.workspace_memberships set status = 'suspended' where id = pg_temp.m('ali@a');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')), null::jsonb,
  'a photo in a membership since suspended is not offered');
rollback to savepoint photo_source_suspended;
savepoint photo_source_closed;
update public.workspaces set lifecycle_status = 'deleted', closed_at = now(), closed_by = tests.user('a:owner') where id = tests.id('a');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')), null::jsonb,
  'a photo in a workspace since closed is not offered');
rollback to savepoint photo_source_closed;
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')) ->> 'source_photo_path', pg_temp.p('ali-3'),
  'the same photo is offered again once its source is live');

-- member_avatar_read ---------------------------------------------------------------------------------

select is(public.get_member_avatar_service(pg_temp.u('mo@a'), tests.id('a'), tests.id('a:ali')), pg_temp.p('ali-3'),
  'member_avatar_read: the manager reads the photo''s path');
select is(public.get_member_avatar_service(pg_temp.u('mo@a'), tests.id('a'), tests.id('a:emre')), null,
  'member_avatar_read: somebody without an avatar reads as null');

-- manager_scope --------------------------------------------------------------------------------------

select is(pg_temp.refusal(format($$select public.get_member_avatar_service(%L, %L, %L)$$, pg_temp.u('mo@a'), tests.id('a'), tests.id('b:ali'))),
  '42501 authz.out_of_scope', 'manager_scope: a record of another workspace is out of scope');
select is(pg_temp.refusal(format($$select public.get_member_avatar_service(%L, %L, %L)$$, tests.user('a:mb'), tests.id('a'), tests.id('a:ali'))),
  '42501 authz.out_of_scope', 'manager_scope: a manager elsewhere does not read the photo');
select is(pg_temp.refusal(format($$select public.remove_member_photo_service(%L, %L, %L)$$, tests.user('a:mb'), tests.id('a'), tests.id('a:ali'))),
  '42501 authz.out_of_scope', 'manager_scope: nor removes it');
select is(pg_temp.refusal(format($$select public.remove_member_photo_service(%L, %L, %L)$$, tests.user('a:emre'), tests.id('a'), tests.id('a:ali'))),
  '42501 authz.missing_permission', 'an employee removes nobody''s photo');
select is(pg_temp.refusal(format($$select public.remove_member_photo_service(%L, %L, %L)$$, pg_temp.u('mo@a'), tests.id('a'), gen_random_uuid())),
  '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is((select photo_path from public.member_avatars where membership_id = pg_temp.m('ali@a')), pg_temp.p('ali-3'),
  'the photo is still there');

-- removed_photo_not_suggested ------------------------------------------------------------------------

select is(public.remove_member_photo_service(pg_temp.u('mo@a'), tests.id('a'), tests.id('a:ali')), pg_temp.p('ali-3'),
  'the manager removes the photo and gets its path to delete');
select is((select count(*)::integer from public.member_avatars where membership_id = pg_temp.m('ali@a')), 0,
  'ali has no avatar in a any more');
select is((select count(*)::integer from public.employee_events
           where employee_id = tests.id('a:ali') and action = 'employee.avatar_removed' and actor_user_id = pg_temp.u('mo@a')), 1,
  'the removal is in the record''s history');
select is((select count(*)::integer from app_private.last_avatars where user_id = pg_temp.u('ali@a')), 0,
  'the last avatar that pointed at it is gone');
select is(public.get_last_avatar_service(pg_temp.u('ali@a'), tests.id('b')), null::jsonb,
  'removed_photo_not_suggested: b suggests nothing');

-- manager_removes_only_photos ------------------------------------------------------------------------

select is(pg_temp.refusal(format($$select public.remove_member_photo_service(%L, %L, %L)$$, pg_temp.u('mo@a'), tests.id('a'), tests.id('a:ali'))),
  'PT409 avatar.not_photo', 'no avatar: nothing to remove');
select public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), '{"art_key": "003-bartender"}');
select is(pg_temp.refusal(format($$select public.remove_member_photo_service(%L, %L, %L)$$, pg_temp.u('mo@a'), tests.id('a'), tests.id('a:ali'))),
  'PT409 avatar.not_photo', 'manager_removes_only_photos: a drawing is the person''s to change');
select is(public.get_member_avatar_service(pg_temp.u('mo@a'), tests.id('a'), tests.id('a:ali')), null,
  'member_avatar_read: a drawing reads as no photo');

-- One's own removal ----------------------------------------------------------------------------------

select is(public.remove_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')), '{"previous_photo_path": null}'::jsonb,
  'removing one''s own drawing hands back no photo');
select is((select count(*)::integer from app_private.last_avatars where user_id = pg_temp.u('ali@a')), 0,
  'and the last avatar that pointed at it goes too');
select public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-1')));
select is(public.remove_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')), jsonb_build_object('previous_photo_path', pg_temp.p('ali-1')),
  'removing one''s own photo hands it back to delete');
select is(public.get_own_avatar_service(pg_temp.u('ali@a'), tests.id('a')) -> 'kind', 'null'::jsonb, 'and leaves no avatar');

-- clear_member_avatar: the one internal place that deletes a membership's avatar (S-187) -------------
-- Removing a person's access calls it; its callers authorize first, so no API role may call it.

select is(
  (select row(p.prosecdef, p.proowner::regrole::text, p.proconfig)::text from pg_proc p
   where p.oid = 'app_private.clear_member_avatar(uuid)'::regprocedure),
  row(true, 'postgres', array['search_path=""'])::text,
  'clear_member_avatar: SECURITY DEFINER, owned by postgres, with an empty search_path');
select is(
  array(select format('%s %s', r, has_function_privilege(r, 'app_private.clear_member_avatar(uuid)', 'EXECUTE'))
        from unnest(array['anon', 'authenticated', 'service_role']) r),
  array['anon f', 'authenticated f', 'service_role f'],
  'clear_member_avatar: neither the browser nor the API can call it');
insert into photos values ('cem-1', pg_temp.photo('cem@a'));
select public.save_own_avatar_service(pg_temp.u('cem@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('cem-1')));
select is((select source_membership_id from app_private.last_avatars where user_id = pg_temp.u('cem@a')), pg_temp.m('cem@a'),
  'clear_member_avatar: cem''s photo is his last avatar');
select is(app_private.clear_member_avatar(pg_temp.m('cem@a')), pg_temp.p('cem-1'),
  'clear_member_avatar: a photo hands back its path for the caller to delete');
select is((select count(*)::integer from public.member_avatars where membership_id = pg_temp.m('cem@a')), 0,
  'clear_member_avatar: the photo avatar is gone');
select is((select count(*)::integer from app_private.last_avatars where source_membership_id = pg_temp.m('cem@a')), 0,
  'clear_member_avatar: and the last avatar that pointed at it');
select public.save_own_avatar_service(pg_temp.u('cem@a'), tests.id('a'), '{"art_key": "015-line-cook"}');
select is(app_private.clear_member_avatar(pg_temp.m('cem@a')), null,
  'clear_member_avatar: a drawing hands back no path');
select is(
  (select count(*)::integer from public.member_avatars where membership_id = pg_temp.m('cem@a'))
  + (select count(*)::integer from app_private.last_avatars where source_membership_id = pg_temp.m('cem@a')), 0,
  'clear_member_avatar: the drawing and the last avatar that pointed at it are gone');
select is(app_private.clear_member_avatar(pg_temp.m('cem@a')), null,
  'clear_member_avatar: no avatar hands back nothing');

-- The foreign keys, pinned (a membership row is never deleted today; slice 4 of ROL-CIFT) -----------

select is(
  array(select format('%s %s', c.conname, c.confdeltype) from pg_constraint c
        where c.conname in ('member_avatars_membership_fkey', 'last_avatars_source_membership_fkey', 'last_avatars_user_fkey')
        order by 1),
  array['last_avatars_source_membership_fkey n', 'last_avatars_user_fkey c', 'member_avatars_membership_fkey c'],
  'the avatar goes with its membership; the last avatar loses only its source');
delete from public.workspace_memberships where id = pg_temp.m('gus@a');
select is((select count(*)::integer from public.member_avatars where membership_id = pg_temp.m('gus@a')), 0,
  'member_avatars_membership_fkey: a deleted membership takes its avatar');
select is((select row(source_membership_id, art_key)::text from app_private.last_avatars where user_id = pg_temp.u('gus@a')),
  row(null::uuid, '007-gm')::text,
  'last_avatars_source_membership_fkey: the drawing stays the last avatar, its source is forgotten');

-- old_paths_gone -------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and column_name = 'avatar_object_path'
     and table_name in ('user_profiles', 'employee_private_profiles')),
  0, 'old_paths_gone: neither old avatar column is left');
select ok(
  to_regprocedure('public.get_employee_avatar_path_service(uuid, uuid, uuid)') is null
  and to_regprocedure('public.get_own_employee_avatar_path_service(uuid, uuid)') is null
  and to_regprocedure('public.remove_employee_avatar_service(uuid, uuid, uuid)') is null,
  'old_paths_gone: the old avatar services are gone');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'account\_profile\_photos\_%'),
  0, 'old_paths_gone: the account photo bucket has no policy left');
-- What the browser would send, worked out before the role changes (the helpers are not the browser's).
select set_config('request.jwt.claim.sub', pg_temp.u('ali@a')::text, true);
select set_config('nf.try_upload',
  format($$insert into storage.objects (bucket_id, name, owner_id) values ('account-profile-photos', %L, %L)$$,
    pg_temp.u('ali@a') || '/profile/' || gen_random_uuid() || '.jpg', pg_temp.u('ali@a')), true);
set local role authenticated;
select throws_ok(current_setting('nf.try_upload'),
  '42501', null, 'old_paths_gone: a signed-in person cannot write to the account photo bucket');
reset role;

-- Account deletion: the person's photos in every workspace go, then their avatars -------------------

select public.save_own_avatar_service(pg_temp.u('ali@a'), tests.id('a'), jsonb_build_object('photo_path', pg_temp.p('ali-2')));
select public.save_own_avatar_service(pg_temp.u('ali@b'), tests.id('b'), jsonb_build_object('photo_path', pg_temp.p('ali-b')));
insert into public.account_deletion_requests (
  id, user_id, typed_email, acknowledged, requested_at, restore_until, recovery_token_digest, recovery_token_rotated_at
) values (
  '79000000-0000-4000-8000-000000000501', pg_temp.u('ali@a'), 'ali-deletes@example.test', true,
  now() - interval '31 days', now() - interval '1 second', repeat('7', 64), now()
);
create temporary table deletion_work as select * from public.claim_account_deletion_work_service(100);
select is((select action from deletion_work where request_id = '79000000-0000-4000-8000-000000000501'), 'finalize',
  'ali''s account deletion is due');
select throws_ok($$select public.list_account_deletion_avatar_objects_service('79000000-0000-4000-8000-000000000501', gen_random_uuid())$$,
  'P0001', 'account deletion lease unavailable', 'only the worker holding the lease reads where the photos are');
select is(
  public.list_account_deletion_avatar_objects_service('79000000-0000-4000-8000-000000000501',
    (select lease_id from deletion_work where request_id = '79000000-0000-4000-8000-000000000501')),
  jsonb_build_object(
    'photos', to_jsonb(array(select x from unnest(array[pg_temp.p('ali-2'), pg_temp.p('ali-b')]) x order by x)),
    'folders', to_jsonb(array(select x from unnest(array[
      tests.id('a') || '/' || pg_temp.m('ali@a') || '/', tests.id('b') || '/' || pg_temp.m('ali@b') || '/']) x order by x))),
  'the worker reads the person''s photos and their own folder in every workspace');
select is(
  public.finalize_claimed_account_deletion_service('79000000-0000-4000-8000-000000000501',
    (select lease_id from deletion_work where request_id = '79000000-0000-4000-8000-000000000501')) ->> 'status',
  'completed', 'the account is purged');
select is((select count(*)::integer from public.member_avatars where membership_id in (pg_temp.m('ali@a'), pg_temp.m('ali@b'))), 0,
  'the purge takes the person''s avatars in every workspace');
select is((select count(*)::integer from app_private.last_avatars where user_id = pg_temp.u('ali@a')), 0,
  'and their last avatar');
select ok(
  not has_function_privilege('authenticated', 'public.list_account_deletion_avatar_objects_service(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_account_deletion_avatar_objects_service(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.list_account_deletion_avatar_objects_service(uuid, uuid)', 'EXECUTE'),
  'only the worker reads them');

-- A closed workspace -------------------------------------------------------------------------------

update public.workspaces set lifecycle_status = 'deleted', closed_at = now(), closed_by = tests.user('a:owner') where id = tests.id('a');
select is(pg_temp.refusal(format($$select public.get_own_avatar_service(%L, %L)$$, pg_temp.u('ali@a'), tests.id('a'))),
  '42501 authz.workspace_closed', 'a closed workspace shows no avatar');

select * from finish();
rollback;
