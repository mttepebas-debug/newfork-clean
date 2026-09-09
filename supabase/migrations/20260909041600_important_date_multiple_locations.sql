-- One important-date record can target several locations. Empty means all.
alter table public.important_dates add column location_ids uuid[] not null default '{}';
update public.important_dates set location_ids=array[location_id] where location_id is not null;
alter table public.important_dates add constraint important_dates_location_ids_limit check (cardinality(location_ids)<=100);

create function public.normalize_important_date_locations()
returns trigger language plpgsql security invoker set search_path='' as $$
declare selected_location uuid; previous_locations uuid[] := '{}'::uuid[];
begin
 if tg_op='UPDATE' then
  previous_locations:=old.location_ids;
  if new.location_ids is not distinct from old.location_ids and new.location_id is distinct from old.location_id then
   new.location_ids:=case when new.location_id is null then '{}'::uuid[] else array[new.location_id] end;
  end if;
 elsif cardinality(new.location_ids)=0 and new.location_id is not null then
  new.location_ids:=array[new.location_id];
 end if;
 if array_position(new.location_ids,null) is not null then raise exception 'valid location required' using errcode='22023'; end if;
 new.location_ids:=array(select distinct id from unnest(new.location_ids) id order by id);
 foreach selected_location in array new.location_ids loop
  if not exists(select 1 from public.locations location where location.id=selected_location and location.workspace_id=new.workspace_id and (location.archived_at is null or selected_location=any(previous_locations))) then
   raise exception 'Choose a location in this workspace' using errcode='23514';
  end if;
 end loop;
 new.location_id:=case when cardinality(new.location_ids)=1 then new.location_ids[1] else null end;
 return new;
end;
$$;
revoke all on function public.normalize_important_date_locations() from public,anon,authenticated;
create trigger normalize_important_date_locations before insert or update of location_ids,location_id,workspace_id on public.important_dates for each row execute function public.normalize_important_date_locations();
NOTIFY pgrst, 'reload schema';
