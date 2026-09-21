-- A short name belongs to the locations people can still pick from, so archiving
-- a location releases its short name the same way it already releases its name.
drop index public.locations_workspace_short_name;
create unique index locations_workspace_short_name
  on public.locations (workspace_id, lower(short_name))
  where short_name is not null and archived_at is null;
