-- BL-768 (KK-174): the Terminate window says the shifts it opens "create
-- manager follow-ups", and nobody heard anything. Each released shift wrote two
-- rows to employee_offboarding_followups (a coverage alert and a compliance
-- review) that no code, screen or policy ever read; Ayse, who manages
-- Kadikoy, found Ali's empty Saturday only by looking at the Schedule.
--
-- After:
-- * schedule.termination.shifts_unassigned: once the termination has opened
--   the published shifts that had not started yet, each manager (a
--   manager-class member whom the core lets edit the Schedule at the location)
--   of a location where a shift opened gets one notice listing the open shifts
--   there: "Ali's 2 shifts are unassigned". The person who left, admins,
--   other locations' managers and whoever ended the employment get none; a
--   location without a manager tells nobody; no shift opened, no notice. A
--   replayed termination returns before it, so it is sent once.
-- * The notice is the follow-up. employee_offboarding_followups had no reader
--   and goes (KK-174: "okuyan yoksa silinir"); employee_offboarding_shift_actions
--   stays the record of which shifts were released.
-- Wording and layout follow the time-off notice (time_off_notify_shifts_opened).
--
-- terminate_employee_service changes on the definition the database holds
-- (pg_get_functiondef): each anchor must be found exactly once, or nothing
-- changes.

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values (
  'schedule.termination.shifts_unassigned', 1, 'schedule', 'action_required', 'confidential',
  '{in_app}', 'immediate', 'termination_location_managers',
  '{"route": "/app/schedule", "allowed_query_keys": ["date"]}',
  '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
  'sensitive_30d', 'schedule.termination.shifts_unassigned.v1', 'active', false, 'workspace'
);
insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract) values
  ('schedule.termination.shifts_unassigned', 1, 'termination-shifts-unassigned',
   '20261012041500_termination_tells_location_managers.sql', 'termination_notify_shifts_unassigned', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at) values
  ('schedule.termination.shifts_unassigned', 1, 'in_app', 'en', 1, 'schedule.termination.shifts_unassigned.v1',
   '{"title": "Shifts are unassigned", "body": "A termination left shifts open.", "action_url": "/app/schedule", "safe_preview": "A termination left shifts open."}',
   'published', now());

create function app_private.termination_notify_shifts_unassigned(actor uuid, w uuid, tid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare fmt text; person_name text; g record;
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select coalesce(nullif(e.preferred_name, ''), e.first_name) into person_name
  from public.employee_terminations t join public.employee_profiles e on e.id = t.employee_id and e.workspace_id = t.workspace_id
  where t.id = tid and t.workspace_id = w;
 -- One notice per set of people who manage the same open shifts.
 for g in
  with opened as (
   select a.location_id, l.name location_name, p.scheduled_date, p.start_time, p.end_time
   from public.employee_offboarding_shift_actions a
   join public.schedule_published_shifts p on p.id = a.shift_id and p.workspace_id = w
   join public.locations l on l.id = a.location_id and l.workspace_id = w
   where a.workspace_id = w and a.termination_id = tid
  ), managers as (
   -- Suspended by now, the person who left is not among them.
   select m.user_id from public.workspace_memberships m
   where m.workspace_id = w and m.status = 'active' and m.user_id is distinct from actor
    and (app_private.actor(m.user_id, w)).class = 'manager'
  ), told as (
   select mg.user_id, o.* from managers mg join opened o
    on app_private.authz_reason(mg.user_id, w, 'schedule.edit', array[o.location_id]) is null
  ), per_person as (
   select t.user_id, count(*)::integer n, min(t.scheduled_date) first_day,
    to_jsonb(array_agg(distinct t.location_id)) location_ids,
    -- "Sat, Oct 18, 10:00 AM–4:00 PM (Kadikoy)": the start day only, also past midnight.
    array_agg(to_char(t.scheduled_date, 'Dy, Mon FMDD') || ', ' || to_char(t.start_time, fmt) || '–' || to_char(t.end_time, fmt)
     || ' (' || t.location_name || ')' order by t.scheduled_date, t.start_time, t.location_name) shift_lines
   from told t group by t.user_id
  ), worded as (
   -- At most three shifts, then "+N more".
   select p.*, array_to_string(p.shift_lines[1:3], '; ')
     || case when cardinality(p.shift_lines) > 3 then '; +' || (cardinality(p.shift_lines) - 3) || ' more' else '' end lines
   from per_person p
  )
  select n, first_day, location_ids, lines, array_agg(user_id order by user_id) recipients
  from worded group by n, first_day, location_ids, lines
 loop
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'schedule.termination.shifts_unassigned', 1, actor,
   'employee_terminations', tid::text,
   jsonb_build_object('termination_id', tid, 'location_ids', g.location_ids, 'recipient_user_ids', to_jsonb(g.recipients),
    'audience_contract', 'termination_location_managers', 'category', 'schedule',
    'title', left(coalesce(person_name, 'A teammate') || '''s ' || case when g.n = 1 then 'shift is unassigned' else g.n || ' shifts are unassigned' end, 160),
    'body', g.lines,
    'safe_preview', 'A termination left shifts open.',
    'action_url', '/app/schedule?date=' || g.first_day::text,
    'group_key', 'employee_terminations:' || tid::text),
   now());
 end loop;
end;
$$;
revoke all on function app_private.termination_notify_shifts_unassigned(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'termination notice: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch(
  'public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, uuid)',
  array[
    $old$  insert into public.employee_offboarding_followups (
    workspace_id, termination_id, shift_id, location_id, kind, context
  )
  select action.workspace_id, action.termination_id, action.shift_id,
    action.location_id, kind.value,
    jsonb_build_object('shift_start_at', action.shift_start_at, 'employee_id', target_employee_id)
  from public.employee_offboarding_shift_actions action
  cross join (values ('coverage_alert'), ('compliance_review')) as kind(value)
  where action.termination_id = v_termination_id;
$old$,
    $new$  -- The managers of each location where a shift opened hear which (KK-174).
  perform app_private.termination_notify_shifts_unassigned(actor_user_id, target_workspace_id, v_termination_id);
$new$,
    '1'
  ]
);

drop function pg_temp.patch(regprocedure, text[]);

drop table public.employee_offboarding_followups;
