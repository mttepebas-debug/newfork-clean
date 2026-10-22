-- The owner setup checklist left Home, Settings and the API on 2026-10-21 (1d17d7db1); nothing calls
-- its services since. This drops its three services, its step list and its progress table, rows included
-- (Mert 2026-10-22, "evet"). The table's policy, grants, keys and check go with it.
-- Kept on purpose: public.service_actor_has_permission and the workspace.setup action.

do $$
begin
  raise notice 'owner_setup_checklist_progress rows dropped: %',
    (select count(*) from public.owner_setup_checklist_progress);
end;
$$;

drop function public.mark_owner_setup_checklist_item_service(uuid, uuid, text);
drop function public.set_owner_setup_checklist_closed_service(uuid, uuid, boolean);
drop function public.get_owner_setup_checklist_progress_service(uuid, uuid);
drop function app_private.owner_setup_checklist_item_ids();
drop table public.owner_setup_checklist_progress;
