-- LINEUP-DB fix: every key between workspace-owned tables carries workspace_id
-- (tenant_owned_composite_foreign_keys). Two lineup row keys didn't:
--   (section_id, location_id)                -> location_sections (id, location_id)
--   (lineup_id, location_id, service_date)   -> daily_lineups (id, location_id, service_date)
-- They become the same keys with workspace_id added, with the same ON DELETE behaviour. The parents' old
-- unique keys served only these two, so they make way for the workspace_id versions. The tables are empty
-- on live (stage 1 has no writer yet).

do $$
begin
  lock table public.location_sections, public.daily_lineups, public.daily_lineup_rows in access exclusive mode;

  alter table public.daily_lineup_rows
    drop constraint daily_lineup_rows_section_id_location_id_fkey,
    drop constraint daily_lineup_rows_lineup_id_location_id_service_date_fkey;

  alter table public.location_sections
    drop constraint location_sections_id_location_id_key,
    add constraint location_sections_id_location_id_workspace_id_key unique (id, location_id, workspace_id);

  alter table public.daily_lineups
    drop constraint daily_lineups_id_location_id_service_date_key,
    add constraint daily_lineups_id_location_id_service_date_workspace_id_key unique (id, location_id, service_date, workspace_id);

  alter table public.daily_lineup_rows
    add constraint daily_lineup_rows_section_id_location_id_workspace_id_fkey
      foreign key (section_id, location_id, workspace_id)
      references public.location_sections (id, location_id, workspace_id) on delete restrict,
    add constraint daily_lineup_rows_lineup_location_day_workspace_fkey -- the full column list runs past 63 characters
      foreign key (lineup_id, location_id, service_date, workspace_id)
      references public.daily_lineups (id, location_id, service_date, workspace_id) on delete cascade;
end
$$;
