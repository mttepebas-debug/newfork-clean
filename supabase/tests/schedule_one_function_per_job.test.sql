begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- FB-6.1 step .4: every Schedule job is one function, and the rules that name
-- several locations at once ask the authorization core for each of them
-- (REUSE "Taslak ve lokasyon" B1, B3, K-2, Q-B; M2 for publish and export).
-- A no is 42501 with an authz.* hint; an unknown draft or template is refused
-- like one out of reach. Ayşe manages Kadıköy only, Ali works at Kadıköy and
-- Beşiktaş, and T is the owner's draft of both.

select tests.world('fj');
select tests.person('fj', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('fj', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('fj', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('fj', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('fj', 'emre', 'employee', array['K'], array['cook']);

create function pg_temp.said(statement text) returns text
language plpgsql
as $$
declare
  code text;
  reason text;
  what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;

-- T: next week, Ali at Kadıköy on Monday and at Beşiktaş on Tuesday, published.
select tests.remember('fj:T', tests.publish_week('fj', 1, '[
  {"label": "ali-k", "person": "ali",  "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "ali-b", "person": "ali",  "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]'));
select ok((select location_ids @> array[tests.id('fj:K'), tests.id('fj:B')] and location_ids <@ array[tests.id('fj:K'), tests.id('fj:B')]
  from public.schedule_drafts where id = tests.id('fj:T')), 'T is a draft of Kadıköy and Beşiktaş');

-- A third location, closed later (Q-B).
-- ponytail: closed by hand; there is no delete-location entry point yet.
insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values (tests.id('fj'), 'Moda', 'MDA', '1 St', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul');
select tests.remember('fj:M', (select l.id from public.locations l where l.workspace_id = tests.id('fj') and l.short_name = 'MDA'));

-- 1. B1: Ayşe opens T and reads the week --------------------------------------------------
create temporary table opened as
select public.acquire_schedule_edit_session_service(tests.user('fj:ayse'), tests.id('fj'), tests.week(1), 'draft', tests.id('fj:T')) as result;
select is((select result -> 'session' -> 'location_ids' from opened), jsonb_build_array(tests.id('fj:K')),
  'Ayşe opens T at Kadıköy only');
select is((select count(*)::integer from opened, jsonb_array_elements(result -> 'session' -> 'shifts') s
  where (s ->> 'location_id')::uuid <> tests.id('fj:K')), 0, 'no Beşiktaş shift of T reaches her edit');
select public.discard_schedule_edit_session_service(tests.user('fj:ayse'), tests.id('fj'), (select (result -> 'session' ->> 'id')::uuid from opened));

create temporary table grid as
select public.get_schedule_read_model_service(tests.user('fj:ayse'), tests.id('fj'), tests.week(1)) as model;
select is((select array(select (l ->> 'id')::uuid from jsonb_array_elements(model -> 'locations') l) from grid),
  array[tests.id('fj:K')], 'her week has no Beşiktaş row');
select is((select array(select (g ->> 'id')::uuid from jsonb_array_elements(model -> 'ghost_shifts') g) from grid),
  array[tests.id('fj:shift:ali-b')], 'Ali''s Beşiktaş shift is a ghost on her week');
select is(pg_temp.said(format($$select public.get_schedule_read_model_service(%L, %L, tests.week(1))$$,
  tests.user('fj:emre'), tests.id('fj'))), '42501 authz.missing_permission schedule.read', 'an employee does not read the manager week');

-- 2. B3: deleting a draft takes every one of its locations ---------------------------------
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:T'))), '42501 authz.out_of_scope schedule.edit',
  'Ayşe cannot delete T, not even its Kadıköy part');
select is((select archived_at from public.schedule_drafts where id = tests.id('fj:T')), null, 'T is still there');
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:owner'), tests.id('fj'), gen_random_uuid())), '42501 authz.out_of_scope schedule.edit',
  'a draft nobody knows is refused like one out of reach, to the owner too');
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:emre'), tests.id('fj'), tests.id('fj:T'))), '42501 authz.missing_permission schedule.edit',
  'an employee does not delete drafts');

-- Q-B: a closed location drops out of the question; nothing left is the
-- organization's, so owner and admins only.
insert into public.schedule_drafts (id, workspace_id, week_start, name, created_by, updated_by, location_ids)
values
  (tests.remember('fj:KM', gen_random_uuid()), tests.id('fj'), tests.week(1), 'Kadikoy and Moda',
   tests.user('fj:owner'), tests.user('fj:owner'), array[tests.id('fj:K'), tests.id('fj:M')]),
  (tests.remember('fj:MM', gen_random_uuid()), tests.id('fj'), tests.week(1), 'Moda only',
   tests.user('fj:owner'), tests.user('fj:owner'), array[tests.id('fj:M')]);

-- Templates: Kadıköy and Beşiktaş; Kadıköy and Moda.
insert into public.schedule_templates (id, workspace_id, name, created_by, updated_by)
values (tests.remember('fj:tpl:KB', gen_random_uuid()), tests.id('fj'), 'Both', tests.user('fj:owner'), tests.user('fj:owner')),
       (tests.remember('fj:tpl:KM', gen_random_uuid()), tests.id('fj'), 'Kadikoy and Moda', tests.user('fj:owner'), tests.user('fj:owner'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis)
select tests.id('fj'), tests.id('fj:tpl:' || t), tests.id('fj:' || l), tests.id('fj:job:cook'), 0, '09:00', '15:00', 'explicit'
from (values ('KB', 'K'), ('KB', 'B'), ('KM', 'K'), ('KM', 'M')) s(t, l);

update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('fj:M');

select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:KM'))), 'allowed',
  'Ayşe deletes a Kadıköy and Moda draft once Moda is closed');
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:MM'))), '42501 authz.out_of_scope schedule.edit',
  'a draft of closed locations only is not hers to delete');
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:owner'), tests.id('fj'), tests.id('fj:MM'))), 'allowed', 'the owner deletes it');

-- 3. K-2: renaming or deleting a template takes every location of its shifts --------------
create function pg_temp.template_as(person text, template_label text, what text) returns text
language sql
as $$
  select pg_temp.said(case what
    when 'rename' then format($f$select public.rename_schedule_template_service(%L, %L, %L, %L, %s)$f$,
      tests.user('fj:' || person), tests.id('fj'), tests.id('fj:tpl:' || template_label), 'Renamed by ' || person,
      coalesce((select t.revision from public.schedule_templates t where t.id = tests.id('fj:tpl:' || template_label)), 1))
    else format($f$select public.delete_schedule_template_service(%L, %L, %L, %s)$f$,
      tests.user('fj:' || person), tests.id('fj'), tests.id('fj:tpl:' || template_label),
      coalesce((select t.revision from public.schedule_templates t where t.id = tests.id('fj:tpl:' || template_label)), 1))
  end)
$$;
select is(pg_temp.template_as('ayse', 'KB', 'rename'), '42501 authz.out_of_scope schedule.templates',
  'Ayşe cannot rename a template with Beşiktaş shifts');
select is(pg_temp.template_as('ayse', 'KB', 'delete'), '42501 authz.out_of_scope schedule.templates',
  'nor delete it');
select is(pg_temp.template_as('can', 'KB', 'rename'), 'allowed', 'Can, a manager of both, renames it');
-- ponytail: delete, not rename: the template read a rename answers with hides a
-- template with a closed location from a manager (FB-6.1 .2), an open question.
select is(pg_temp.template_as('ayse', 'KM', 'delete'), 'allowed', 'Ayşe deletes a Kadıköy and Moda template once Moda is closed');
select is(pg_temp.said(format($$select public.rename_schedule_template_service(%L, %L, %L, 'Nobody', 1)$$,
  tests.user('fj:owner'), tests.id('fj'), gen_random_uuid())), '42501 authz.out_of_scope schedule.templates',
  'a template nobody knows is refused like one out of reach');
select is(pg_temp.template_as('zeynep', 'KB', 'delete'), 'allowed', 'an admin deletes a template of both locations');
select is((select count(*)::integer from public.schedule_templates where id = tests.id('fj:tpl:KB')), 0, 'and it is gone');

-- 4. Q2: a publish names only locations the manager publishes at ---------------------------
create temporary table previewed as
select public.preview_schedule_publication_service(tests.user('fj:owner'), tests.id('fj'), tests.id('fj:T'),
  array[tests.id('fj:K'), tests.id('fj:B')], null, true) as preview;
select is(pg_temp.said(format($$select public.preview_schedule_publication_service(%L, %L, %L, %L::uuid[], null, true)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:T'), array[tests.id('fj:K'), tests.id('fj:B')])),
  '42501 authz.out_of_scope schedule.publish', 'Ayşe cannot preview T at Kadıköy and Beşiktaş');
select is(pg_temp.said(format($$select public.preview_schedule_publication_service(%L, %L, %L, %L::uuid[], null, true)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:T'), array[tests.id('fj:K')])), 'allowed', 'she previews it at Kadıköy');
select is(pg_temp.said(format($$select public.publish_schedule_draft_service(%L, %L, %L, %L::uuid[], null, true, %s, %L, '[]')$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:T'), array[tests.id('fj:K'), tests.id('fj:B')],
  (select revision from public.schedule_drafts where id = tests.id('fj:T')), (select preview ->> 'fingerprint' from previewed))),
  '42501 authz.out_of_scope schedule.publish', 'nor publish it at both');
select is(pg_temp.said(format($$select public.preview_schedule_unpublication_service(%L, %L, tests.week(1), %L::uuid[])$$,
  tests.user('fj:ayse'), tests.id('fj'), array[tests.id('fj:K'), tests.id('fj:B')])),
  '42501 authz.out_of_scope schedule.publish', 'nor take the week down at both');
select is(pg_temp.said(format($$select public.preview_schedule_unpublication_service(%L, %L, tests.week(1), %L::uuid[])$$,
  tests.user('fj:ayse'), tests.id('fj'), array[tests.id('fj:K')])), 'allowed', 'she can take it down at Kadıköy');

-- 5. Q3: an export names only locations the manager reaches (M2) --------------------------
select public.create_schedule_export_preset_service(tests.user('fj:ayse'), tests.id('fj'), 'Mine', '{}'::jsonb);
create function pg_temp.export_payload(locs text[]) returns jsonb
language sql
as $$
  select jsonb_build_object('preset_id', (select p.id from public.schedule_export_presets p
      where p.workspace_id = tests.id('fj') and p.created_by = tests.user('fj:ayse')),
    'name', 'Weekly ' || array_to_string(locs, ''), 'recipients', '["books@example.test"]'::jsonb,
    'location_ids', (select jsonb_agg(tests.id('fj:' || l)) from unnest(locs) l),
    'day_of_week', 1, 'send_hour', 9, 'timezone', 'Europe/Istanbul')
$$;
select is(pg_temp.said(format($$select public.record_schedule_export_event_service(%L, %L, 'week', 'pdf', %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'), jsonb_build_object('location_ids', jsonb_build_array(tests.id('fj:B'))))),
  '42501 authz.out_of_scope schedule.export', 'Ayşe does not export Beşiktaş');
select is(pg_temp.said(format($$select public.record_schedule_export_event_service(%L, %L, 'week', 'pdf', %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'), jsonb_build_object('location_ids', jsonb_build_array(tests.id('fj:K'))))),
  'allowed', 'she exports Kadıköy');
select is(pg_temp.said(format($$select public.create_schedule_export_schedule_service(%L, %L, %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'), pg_temp.export_payload(array['K', 'B']))),
  '42501 authz.out_of_scope schedule.export', 'nor schedules a weekly export of both');
select is(pg_temp.said(format($$select public.create_schedule_export_schedule_service(%L, %L, %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'), pg_temp.export_payload(array['K']))), 'allowed', 'she schedules one of Kadıköy');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'),
  (select s.id from public.scheduled_schedule_exports s where s.workspace_id = tests.id('fj') and s.created_by = tests.user('fj:ayse')),
  jsonb_build_object('location_ids', jsonb_build_array(tests.id('fj:K'), tests.id('fj:B'))))),
  '42501 authz.out_of_scope schedule.export', 'nor adds Beşiktaş to it later');

-- BL-494 (KARARLAR 2026-10-01): a weekly export rule is changed by whoever
-- reaches its locations, not only by who set it up. The owner and Can, who
-- manages Kadıköy too, change Ayşe's Kadıköy rule; Mehmet, Beşiktaş only,
-- cannot, and his answer for her rule is the one for a rule that does not exist.
select tests.person('fj', 'mehmet', 'manager', array['B'], array['cook']);
select tests.remember('fj:export:K', (select s.id from public.scheduled_schedule_exports s
  where s.workspace_id = tests.id('fj') and s.created_by = tests.user('fj:ayse')));
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:owner'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('recipients', '["chef@example.test"]'::jsonb))),
  'allowed', 'the owner changes the address on Ayşe''s Kadıköy rule');
select is((select s.recipients from public.scheduled_schedule_exports s where s.id = tests.id('fj:export:K')),
  '["chef@example.test"]'::jsonb, 'and the rule now goes to the new address');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'), jsonb_build_object('send_hour', 10))),
  'allowed', 'Can, who manages Kadıköy too, changes it');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:mehmet'), tests.id('fj'), tests.id('fj:export:K'), jsonb_build_object('send_hour', 11))),
  '42501 authz.out_of_scope schedule.export', 'Mehmet, Beşiktaş only, does not');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:mehmet'), tests.id('fj'), gen_random_uuid(), jsonb_build_object('send_hour', 11))),
  '42501 authz.out_of_scope schedule.export', 'and a rule that does not exist answers him the same');
select is(pg_temp.said(format($$select public.delete_schedule_export_schedule_service(%L, %L, %L)$$,
  tests.user('fj:mehmet'), tests.id('fj'), tests.id('fj:export:K'))),
  '42501 authz.out_of_scope schedule.export', 'nor does he delete it');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:ayse'), tests.id('fj'), tests.id('fj:export:K'), jsonb_build_object('send_hour', 9))),
  'allowed', 'Ayşe still changes her own rule');
-- The rule sends as the person who set it up: a location Ayşe cannot export
-- would switch it off at its first send, so nobody adds one for her (review O1).
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:owner'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('location_ids', jsonb_build_array(tests.id('fj:K'), tests.id('fj:B'))))),
  '22023 schedule.export_rule_beyond_its_owner', 'the owner cannot add Beşiktaş, which Ayşe does not export, to her rule');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('location_ids', jsonb_build_array(tests.id('fj:K'), tests.id('fj:B'))))),
  '22023 schedule.export_rule_beyond_its_owner', 'nor can Can, who manages both');
-- Where the rule goes and what it is called stay with the person who set it
-- up and with the owner and admins (KK-224): Can changes when it runs, not who
-- reads Ayşe's schedule, and cannot probe the names of rules he did not make.
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('recipients', '["can@example.test"]'::jsonb))),
  '42501 authz.out_of_scope schedule.export', 'Can does not send Ayşe''s rule to his own address');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'), jsonb_build_object('name', 'Moda weekly'))),
  '42501 authz.out_of_scope schedule.export', 'nor renames it');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('name', ' Weekly K ', 'recipients', '["chef@example.test"]'::jsonb, 'send_hour', 9))),
  'allowed', 'the whole rule sent back with its name and address unchanged still saves');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:zeynep'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('recipients', '["books@example.test"]'::jsonb))),
  'allowed', 'Zeynep, an admin, changes the address');
select is((select s.recipients from public.scheduled_schedule_exports s where s.id = tests.id('fj:export:K')),
  '["books@example.test"]'::jsonb, 'and the rule goes where Zeynep set it');
-- A rule keeps its own preset; switching it takes one of the editor's own.
select public.create_schedule_export_preset_service(tests.user('fj:owner'), tests.id('fj'), 'Owner weekly', '{}'::jsonb);
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('preset_id', (select p.id from public.schedule_export_presets p
    where p.workspace_id = tests.id('fj') and p.name = 'Owner weekly')))),
  'P0002', 'Can cannot switch Ayşe''s rule to the owner''s preset');
-- Nor to his own: her mail would go out with his settings, and he could not
-- delete his preset while her rule used it (EKRAN-01 B9).
select public.create_schedule_export_preset_service(tests.user('fj:can'), tests.id('fj'), 'Can weekly', '{}'::jsonb);
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fj:can'), tests.id('fj'), tests.id('fj:export:K'),
  jsonb_build_object('preset_id', (select p.id from public.schedule_export_presets p
    where p.workspace_id = tests.id('fj') and p.name = 'Can weekly')))),
  'P0002', 'nor to his own preset');
-- Another workspace's owner reaches nothing here, whatever the rule id.
select tests.world('fk');
select is(pg_temp.said(format($$select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)$$,
  tests.user('fk:owner'), tests.id('fk'), tests.id('fj:export:K'), jsonb_build_object('send_hour', 7))),
  'P0002', 'another workspace''s owner does not find Ayşe''s rule');
select is(pg_temp.said(format($$select public.delete_schedule_export_schedule_service(%L, %L, %L)$$,
  tests.user('fk:owner'), tests.id('fk'), tests.id('fj:export:K'))),
  'P0002', 'nor deletes it');
select is((select s.send_hour::integer from public.scheduled_schedule_exports s where s.id = tests.id('fj:export:K')),
  9, 'and the rule is as Ayşe left it');

-- 6. Last, B3 again: the admin deletes T ------------------------------------------------------
select is(pg_temp.said(format($$select public.delete_schedule_draft_service(%L, %L, %L)$$,
  tests.user('fj:zeynep'), tests.id('fj'), tests.id('fj:T'))), 'allowed', 'Zeynep, an admin, deletes T');
select isnt((select archived_at from public.schedule_drafts where id = tests.id('fj:T')), null, 'T is deleted');

-- 7. One function per job ---------------------------------------------------------------------
select is(
  array(
    select p.proname::text || '/' || p.pronargs from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname ~ '^(get_schedule_read_model_service|get_schedule_edit_session_service|acquire_schedule_edit_session_service|mutate_schedule_edit_shift_service|save_schedule_edit_session_service|preview_schedule_publication|publish_schedule_draft|preview_schedule_unpublication|unpublish_schedule_service|apply_schedule_template_service|create_schedule_template_service)'
    order by 1
  ),
  array['acquire_schedule_edit_session_service/7', 'apply_schedule_template_service/7', 'create_schedule_template_service/5',
        'get_schedule_edit_session_service/3', 'get_schedule_read_model_service/3', 'mutate_schedule_edit_shift_service/9',
        'preview_schedule_publication_service/6', 'preview_schedule_unpublication_service/4', 'publish_schedule_draft_service/10',
        'save_schedule_edit_session_service/8', 'unpublish_schedule_service/5'],
  'each Schedule job is one function: read, edit, save, publish and the rest'
);
select is(
  array(select p.proname::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.proname ~ 'schedule' and p.proname ~ '(_base|_v[0-9]+|_legacy)(_|$)' order by 1),
  '{}'::text[], 'no Schedule _base, _vN or _legacy layer is left'
);

select * from finish();
rollback;
