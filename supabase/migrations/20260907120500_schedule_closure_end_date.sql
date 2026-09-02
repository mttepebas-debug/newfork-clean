alter table public.schedule_closures
  add column if not exists end_date date;

update public.schedule_closures
set end_date = closed_date
where end_date is null;

do $$
begin
  alter table public.schedule_closures
    add constraint schedule_closures_end_date_check
    check (end_date is null or end_date >= closed_date);
exception
  when duplicate_object then null;
end;
$$;
