-- EKRAN-01 DB-2 (B-2): the Schedule's live channels ask the authorization core,
-- one location at a time.
--
-- Before: schedule notices went to one workspace-wide topic and both policies
-- asked the old workspace_has_permission helper, which says yes to employees
-- the core refuses. A Besiktas manager heard every Kadikoy save; a Kadikoy
-- employee could join the presence channel and pose as an editor.
--
-- After:
--   schedule:invalidation:<workspace>:<location>          notices, read only
--   schedule:presence:<workspace>:<location>:<week>        presence, read + write
-- Both are open exactly to people the core lets read that location's schedule
-- (rls_can 'schedule.read' with the location). The workspace-wide notice topic
-- is gone: it matches no policy, so nobody can join it.

drop policy "schedule readers receive schedule notices" on realtime.messages;
drop policy "schedule readers share their presence" on realtime.messages;

create policy "schedule readers receive schedule notices"
on realtime.messages
for select
to authenticated
using (
  case
    when extension = 'broadcast'
      and (select realtime.topic()) ~ '^schedule:invalidation:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then app_private.rls_can(
      split_part((select realtime.topic()), ':', 3)::uuid,
      'schedule.read',
      array[split_part((select realtime.topic()), ':', 4)::uuid]
    )
    when extension in ('broadcast', 'presence')
      and (select realtime.topic()) ~ '^schedule:presence:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:'
    then app_private.rls_can(
      split_part((select realtime.topic()), ':', 3)::uuid,
      'schedule.read',
      array[split_part((select realtime.topic()), ':', 4)::uuid]
    )
    else false
  end
);

create policy "schedule readers share their presence"
on realtime.messages
for insert
to authenticated
with check (
  case
    when extension = 'presence'
      and (select realtime.topic()) ~ '^schedule:presence:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:'
    then app_private.rls_can(
      split_part((select realtime.topic()), ':', 3)::uuid,
      'schedule.read',
      array[split_part((select realtime.topic()), ':', 4)::uuid]
    )
    else false
  end
);
