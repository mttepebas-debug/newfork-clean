-- FOUNDATION-B stage 3 follow-up: joining the Schedule's private "who is
-- looking" channel works.
--
-- Realtime decides whether a browser may join a private channel by checking
-- that it could read a broadcast message on the topic, also when the channel
-- is only used for presence. The receive policy from 20260923123347 allowed
-- presence reads on schedule:presence topics but not broadcast reads, so
-- every join was refused ("You do not have permissions to read from this
-- Channel topic"). Found by a live check against the local Realtime server;
-- the pgTAP test only asked about presence. Same people as before: whoever
-- can read the workspace's schedule and reach that location.

drop policy "schedule readers receive schedule notices" on realtime.messages;

create policy "schedule readers receive schedule notices"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.messages.extension = 'broadcast'
      and (select realtime.topic()) ~ '^schedule:invalidation:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then app_private.workspace_has_permission(split_part((select realtime.topic()), ':', 3)::uuid, 'schedule.read')
    when realtime.messages.extension in ('broadcast', 'presence')
      and (select realtime.topic()) ~ '^schedule:presence:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:'
    then app_private.workspace_has_permission(split_part((select realtime.topic()), ':', 3)::uuid, 'schedule.read')
      and app_private.can_access_location(split_part((select realtime.topic()), ':', 3)::uuid, split_part((select realtime.topic()), ':', 4)::uuid)
    else false
  end
);
