-- BL-1049: a role or notification settings write refused with PT409 now says
-- which kind of refusal in its hint, the machine key the API passes on as
-- `reason` (the method of BL-1028). The notification policy screen used to look
-- for "stale" in the English sentence; the role editor and the personal
-- notification preferences could only show the sentence. Only the hints are
-- added; every sentence, code and check stays as it was.
--   role.changed                     the role was saved by somebody else since it was opened: reload
--   role.in_use                      members, invitations or access snapshots still hold the role
--   notification.policy_changed      the workspace notification policy moved on: reload
--   notification.preference_changed  the person's own notification preference moved on: reload
--
-- The functions change on the definitions the database holds
-- (pg_get_functiondef): each anchor must be found exactly as often as
-- expected, or nothing changes. Each anchor runs to the end of its statement,
-- so a second run finds none and stops instead of adding a second hint.

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
      raise exception 'refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamp with time zone)', array[
  '''Role changed since you opened it. Reload before saving.'' using errcode=''PT409''; end if;',
  '''Role changed since you opened it. Reload before saving.'' using errcode=''PT409'',hint=''role.changed''; end if;', '1'
]);

select pg_temp.patch('public.delete_workspace_role_service(uuid,uuid,uuid)', array[
  '''Role has member or invitation references. Resolve these dependencies before deleting.'' using errcode=''PT409''; end if;',
  '''Role has member or invitation references. Resolve these dependencies before deleting.'' using errcode=''PT409'',hint=''role.in_use''; end if;', '1'
]);

select pg_temp.patch('public.save_notification_policy_service(uuid,uuid,text,integer,text,uuid,integer,boolean,text[],text,text)', array[
  '''notification policy stale version'' using errcode = ''PT409'';',
  '''notification policy stale version'' using errcode = ''PT409'', hint = ''notification.policy_changed'';', '1'
]);

select pg_temp.patch('public.save_notification_user_preferences_service(uuid,uuid,jsonb)', array[
  '''stale notification preference version'' using errcode = ''PT409'';',
  '''stale notification preference version'' using errcode = ''PT409'', hint = ''notification.preference_changed'';', '1'
]);
