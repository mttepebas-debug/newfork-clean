-- AVATAR-IKON slice 4 follow-up (nf-guvenlik Low @3fc18ff70; Mert 2026-10-20 "başla"): deleting a person, a job or
-- an archive drawing looks up daily_lineup_drawings by that column; without an index each such delete scans the
-- table. The lineup's foreign key needs none: the primary key leads with lineup_id. Only adds.

create index daily_lineup_drawings_employee_idx on public.daily_lineup_drawings (employee_id);
create index daily_lineup_drawings_job_idx on public.daily_lineup_drawings (job_id);
create index daily_lineup_drawings_art_idx on public.daily_lineup_drawings (art_key);
