-- Bring every location short name to the A–Z/0–9/- contract (LOC-002).
-- Mirrors suggestLocationShortName in packages/shared: multi-word names use
-- initials, one word uses its first letter plus following consonants (max 3),
-- otherwise its first 3 distinct characters. Collisions get -2, -3, ...
create function pg_temp.suggest_short_name(p_name text)
returns text language plpgsql immutable as $$
declare
  words text[] := array(
    select m[1] from regexp_matches(
      upper(translate(p_name,
        'ıİçÇğĞöÖşŞüÜâÂàÀáÁäÄåÅãÃêÊèÈéÉëËîÎìÌíÍïÏôÔòÒóÓõÕûÛùÙúÚñÑ',
        'iIcCgGoOsSuUaAaAaAaAaAaAeEeEeEeEiIiIiIiIoOoOoOoOuUuUuUnN')),
      '[A-Z0-9]+', 'g') as m);
  word text := coalesce(words[1], '');
  pick text := '';
  ch text;
begin
  if cardinality(words) > 1 then
    pick := left(array_to_string(array(select left(w, 1) from unnest(words) w), ''), 12);
  else
    pick := left(word, 1) || regexp_replace(substr(word, 2), '[AEIOU0-9]', '', 'g');
    if length(pick) < 2 then
      pick := '';
      foreach ch in array regexp_split_to_array(word, '') loop
        if position(ch in pick) = 0 then pick := pick || ch; end if;
      end loop;
    end if;
    pick := left(pick, 3);
  end if;
  return case when length(pick) >= 2 then pick else 'LOC' end;
end;
$$;

do $$
declare
  loc record;
  base text;
  candidate text;
  n int;
begin
  for loc in
    select id, workspace_id, name from public.locations
    where short_name is null or short_name !~ '^[A-Z0-9-]{2,12}$'
    order by workspace_id, created_at, id
  loop
    base := pg_temp.suggest_short_name(loc.name);
    candidate := base;
    n := 1;
    while exists (
      select 1 from public.locations
      where workspace_id = loc.workspace_id and id <> loc.id
        and lower(short_name) = lower(candidate)
    ) loop
      n := n + 1;
      candidate := left(base, 12 - length('-' || n)) || '-' || n;
    end loop;
    update public.locations set short_name = candidate where id = loc.id;
  end loop;
end;
$$;

drop function pg_temp.suggest_short_name(text);

-- Every row now conforms: enforce the contract in the table itself. The
-- legacy-null trigger is no longer needed.
alter table public.locations drop constraint locations_short_name_format;
alter table public.locations add constraint locations_short_name_format
  check (short_name ~ '^[A-Z0-9-]{2,12}$');
alter table public.locations alter column short_name set not null;
drop trigger locations_require_short_name on public.locations;
drop function public.require_location_short_name();
