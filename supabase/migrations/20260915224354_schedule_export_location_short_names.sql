-- Legacy rows remain readable and are deliberately not backfilled.
alter table public.locations add column short_name text;
alter table public.locations add constraint locations_short_name_format
  check (short_name is null or
    (char_length(short_name) between 2 and 12 and short_name ~ '^[[:alnum:]-]+$'));
create unique index locations_workspace_short_name
  on public.locations (workspace_id, lower(short_name))
  where short_name is not null;

-- Preserve unrelated edits/archive operations on legacy rows, but require a
-- short name for new locations and never permit clearing an assigned value.
create function public.require_location_short_name()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.short_name is null and
     (tg_op = 'INSERT' or old.short_name is not null) then
    raise check_violation using message = 'A location short name is required';
  end if;
  return new;
end;
$$;
revoke all on function public.require_location_short_name() from public, anon, authenticated;
create trigger locations_require_short_name
  before insert or update of short_name on public.locations
  for each row execute function public.require_location_short_name();
