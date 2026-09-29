-- FB-6.2 .6: nothing asks the old "may I see this person" helper any more
-- (Settings > Jobs, catalog deletion and Workspace home ask the core); both
-- copies go (retired_objects_stay_gone).
drop function public.can_access_employee(uuid, uuid);
drop function app_private.can_access_employee(uuid, uuid);
