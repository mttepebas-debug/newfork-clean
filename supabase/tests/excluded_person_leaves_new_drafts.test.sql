begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- BL-218 (T2 a). A person excluded from Schedule gets no new shift in an
-- edit: not by hand, not as a pending change, not from a template (the
-- template's shift stays, open). What was published before the exclusion
-- stays with them: editing that week, publishing it again, taking it down and
-- putting the same draft back up all keep the person and their shifts.
-- Not decided yet (asked 2026-09-27): a shift written into a draft before
-- the person was excluded and never published. No cell here covers it.

-- The SQLSTATE a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate;
  return state;
end;
$$;

select tests.world('ex');
select tests.person('ex', 'eda', 'employee', array['K'], array['cook']);
select tests.person('ex', 'fikret', 'employee', array['K'], array['cook']);
select tests.remember('ex:draft:w1', tests.publish_week('ex', 1,
  '[{"label": "eda_w1", "person": "eda", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"}]'));

-- Eda is excluded after that week was published.
update public.employee_profiles set is_excluded_from_schedule = true where id = tests.id('ex:eda');

create function pg_temp.open_edit(n integer, source text, draft uuid default null) returns uuid
language sql as $$
  select (public.acquire_schedule_edit_session_service(
    tests.user('ex:owner'), tests.id('ex'), tests.week(n), source::public.schedule_edit_source, draft
  ) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.add(session uuid, n integer, person text, day integer) returns text
language sql as $$
  select pg_temp.refusal(format(
    'select tests.add_shift(%L, %L, %L, %s, %L::jsonb)',
    tests.user('ex:owner'), 'ex', session, n,
    jsonb_build_object('person', person, 'loc', 'K', 'job', 'cook', 'day', day, 'start', '14:00', 'end', '18:00')
  ))
$$;
-- Save the edit as a draft; publish a draft at Kadikoy, as tests.publish_week
-- does, answering with the refusal (so a blocked publish is a red cell, not an
-- aborted file).
create function pg_temp.save(session uuid) returns uuid
language sql as $$
  select (public.save_schedule_edit_session_service(
    tests.user('ex:owner'), tests.id('ex'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'bl218 ' || gen_random_uuid(), null, null
  ) ->> 'id')::uuid
$$;
create function pg_temp.publish(draft uuid) returns text
language sql as $$
  select pg_temp.refusal(format(
    'select public.publish_schedule_draft_service(%1$L, %2$L, %3$L, %4$L, null, true, %5$s,
       public.preview_schedule_publication_service(%1$L, %2$L, %3$L, %4$L, null, true) ->> ''fingerprint'', ''[]''::jsonb)',
    tests.user('ex:owner'), tests.id('ex'), draft, array[tests.id('ex:K')],
    (select d.revision from public.schedule_drafts d where d.id = draft)
  ))
$$;
create function pg_temp.published_for(person text, n integer) returns integer language sql as $$
  select count(*)::integer from public.schedule_published_shifts s
  join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
  where s.employee_id = tests.id('ex:' || person) and p.week_start = tests.week(n)
$$;

-- 1. The published week keeps Eda --------------------------------------------------------

select tests.remember('ex:edit:w1', pg_temp.open_edit(1, 'published'));
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts
   where session_id = tests.id('ex:edit:w1') and employee_id = tests.id('ex:eda')),
  1,
  'editing the published week brings Eda''s shift along'
);
select is(pg_temp.add(tests.id('ex:edit:w1'), 1, 'eda', 3), '23514',
  'but she gets no new shift in it');
select is(pg_temp.add(tests.id('ex:edit:w1'), 1, 'fikret', 3), 'allowed',
  'while somebody not excluded does');

-- Today the publish check reads Eda as "not active in Schedule" and blocks the
-- whole week over the shift she already had.
select tests.remember('ex:draft:w1b', pg_temp.save(tests.id('ex:edit:w1')));
select is(pg_temp.publish(tests.id('ex:draft:w1b')), 'allowed',
  'the edited week publishes with Eda''s shift in it');
select is(pg_temp.published_for('eda', 1), 1,
  'and her shift is still published');

-- Taken down, then the same draft put back up.
select public.unpublish_schedule_service(tests.user('ex:owner'), tests.id('ex'), tests.week(1), array[tests.id('ex:K')],
  public.preview_schedule_unpublication_service(tests.user('ex:owner'), tests.id('ex'), tests.week(1), array[tests.id('ex:K')]) ->> 'fingerprint');
select is(pg_temp.published_for('eda', 1), 0, 'the week is down');
select tests.remember('ex:edit:w1c', pg_temp.open_edit(1, 'draft', tests.id('ex:draft:w1b')));
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts
   where session_id = tests.id('ex:edit:w1c') and employee_id = tests.id('ex:eda')),
  1,
  'opening the same draft again brings Eda''s shift along'
);
select is(pg_temp.publish(pg_temp.save(tests.id('ex:edit:w1c'))), 'allowed',
  'and it publishes again');
select is(pg_temp.published_for('eda', 1), 1,
  'with her shift');

-- 2. A new draft has no place for Eda ----------------------------------------------------

select tests.remember('ex:edit:w2', pg_temp.open_edit(2, 'blank'));
select is(pg_temp.add(tests.id('ex:edit:w2'), 2, 'eda', 1), '23514',
  'a new draft gives Eda no shift by hand');
select is(pg_temp.add(tests.id('ex:edit:w2'), 2, 'fikret', 1), 'allowed',
  'somebody not excluded is scheduled as usual');
select is(
  pg_temp.refusal(format(
    'select public.add_schedule_pending_op_service(%L, %L, %L, %L, null, %L::jsonb)',
    tests.user('ex:owner'), tests.id('ex'), tests.id('ex:edit:w2'), 'create',
    jsonb_build_object(
      'location_id', tests.id('ex:K'), 'employee_id', tests.id('ex:eda'), 'job_id', tests.id('ex:job:cook'),
      'scheduled_date', tests.week(2) + 2, 'time_basis', 'explicit',
      'start_time', '09:00', 'end_time', '13:00', 'time_timezone', 'Europe/Istanbul'
    )
  )),
  '23514',
  'nor as a pending change'
);

-- A template that names Eda: its shift comes in open.
insert into public.schedule_templates (id, workspace_id, name, created_by, updated_by)
values (tests.remember('ex:template', gen_random_uuid()), tests.id('ex'), 'Week with Eda', tests.user('ex:owner'), tests.user('ex:owner'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, employee_id, job_id, day_offset, start_time, end_time, time_basis, time_timezone, note)
values (tests.id('ex'), tests.id('ex:template'), tests.id('ex:K'), tests.id('ex:eda'), tests.id('ex:job:cook'), 3, '09:00', '13:00', 'explicit', 'Europe/Istanbul', '');
-- Today the whole apply is refused ("Resolve availability ... before this
-- assignment") instead of leaving her shift open.
select is(
  pg_temp.refusal(format(
    'select public.apply_schedule_template_service(%L, %L, %L, %s, %L, %L)',
    tests.user('ex:owner'), tests.id('ex'), tests.id('ex:edit:w2'),
    (select revision from public.schedule_edit_sessions where id = tests.id('ex:edit:w2')),
    tests.id('ex:template'), 'merge'
  )),
  'allowed',
  'a template naming Eda still applies to a new draft'
);
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts
   where session_id = tests.id('ex:edit:w2') and employee_id = tests.id('ex:eda')),
  0,
  'a template gives Eda no shift in a new draft'
);
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts
   where session_id = tests.id('ex:edit:w2') and employee_id is null and scheduled_date = tests.week(2) + 3),
  1,
  'its shift comes in open instead'
);

-- 3. A draft shift written before the exclusion stays for the manager -------------------
-- S3 (user, 2026-09-28): it is not removed silently; the week does not publish
-- with it, the manager sees it and deletes it.

select tests.person('ex', 'gul', 'employee', array['K'], array['cook']);
select tests.remember('ex:edit:w3', pg_temp.open_edit(3, 'blank'));
select tests.remember('ex:shift:gul', tests.add_shift(tests.user('ex:owner'), 'ex', tests.id('ex:edit:w3'), 3,
  '{"person": "gul", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"}'));
select tests.remember('ex:draft:w3', pg_temp.save(tests.id('ex:edit:w3')));
update public.employee_profiles set is_excluded_from_schedule = true where id = tests.id('ex:gul');

select tests.remember('ex:edit:w3b', pg_temp.open_edit(3, 'draft', tests.id('ex:draft:w3')));
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts
   where session_id = tests.id('ex:edit:w3b') and id = tests.id('ex:shift:gul') and employee_id = tests.id('ex:gul')),
  1,
  'the draft keeps the shift written for Gül before she was excluded'
);
select tests.remember('ex:draft:w3b', pg_temp.save(tests.id('ex:edit:w3b')));
select is(pg_temp.publish(tests.id('ex:draft:w3b')), '23514',
  'the week does not publish with it');
-- The manager opens the draft again and deletes the shift.
select tests.remember('ex:edit:w3c', pg_temp.open_edit(3, 'draft', tests.id('ex:draft:w3b')));
select public.mutate_schedule_edit_shift_service(
  tests.user('ex:owner'), tests.id('ex'), tests.id('ex:edit:w3c'),
  (select revision from public.schedule_edit_sessions where id = tests.id('ex:edit:w3c')),
  'delete', tests.id('ex:shift:gul'),
  (select revision from public.schedule_edit_session_shifts where session_id = tests.id('ex:edit:w3c') and id = tests.id('ex:shift:gul'))
);
select is(pg_temp.publish(pg_temp.save(tests.id('ex:edit:w3c'))), 'allowed',
  'once the manager deletes it, the week publishes');

-- 4. BL-761: archived, or off the job, after the draft was written -----------------------
-- The publish check reads the person again; a shift written while they still
-- worked here (by hand, or brought back by Undo) never reaches the published week.

select tests.person('ex', 'hakan', 'employee', array['K'], array['cook']);
select tests.person('ex', 'irem', 'employee', array['K'], array['cook']);
select tests.remember('ex:edit:w4', pg_temp.open_edit(4, 'blank'));
select tests.add_shift(tests.user('ex:owner'), 'ex', tests.id('ex:edit:w4'), 4,
  '{"person": "hakan", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"}');
select tests.add_shift(tests.user('ex:owner'), 'ex', tests.id('ex:edit:w4'), 4,
  '{"person": "irem", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}');
select tests.remember('ex:draft:w4', pg_temp.save(tests.id('ex:edit:w4')));
-- Both shifts are in the draft, so a 0 on the published week below is the
-- publish check's doing, not a shift that was never written (EKRAN-01 B17).
select is((select count(*)::integer from public.schedule_draft_shifts d
  where d.draft_id = tests.id('ex:draft:w4') and d.employee_id in (tests.id('ex:hakan'), tests.id('ex:irem'))),
  2, 'the saved draft holds Hakan''s and İrem''s shifts');

update public.employee_profiles set archived_at = now() where id = tests.id('ex:hakan');
select is(pg_temp.publish(tests.id('ex:draft:w4')), '23514',
  'a draft shift for a person archived since does not publish');
select is(pg_temp.published_for('hakan', 4), 0, 'and Hakan is not on the published week');

update public.employee_profiles set archived_at = null where id = tests.id('ex:hakan');
update public.employee_job_assignments set ended_at = clock_timestamp()
where employee_id = tests.id('ex:irem') and ended_at is null;
select is(pg_temp.publish(tests.id('ex:draft:w4')), '23514',
  'a draft shift for a person taken off the job since does not publish');
select is(pg_temp.published_for('irem', 4), 0, 'and İrem is not on the published week');

-- Back on the job, the same draft publishes: the person was the reason.
update public.employee_job_assignments set ended_at = null where employee_id = tests.id('ex:irem');
select is(pg_temp.publish(tests.id('ex:draft:w4')), 'allowed',
  'with İrem back on the job the same draft publishes');
select is(pg_temp.published_for('irem', 4), 1, 'and İrem is on the published week');
select is(pg_temp.published_for('hakan', 4), 1, 'and so is Hakan, no longer archived');

select * from finish();
rollback;
