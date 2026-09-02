alter table public.schedule_closures
  add column if not exists shift_type_ids uuid[] not null default '{}';

do $$
begin
  alter table public.schedule_closures
    add constraint schedule_closures_shift_type_scope_check
    check (
      (is_all_day and coalesce(array_length(shift_type_ids, 1), 0) = 0)
      or
      (not is_all_day and coalesce(array_length(shift_type_ids, 1), 0) > 0)
    );
exception
  when duplicate_object then null;
end;
$$;
