-- LINEUP-EDIT L2b, part 1 of 4 (KARARLAR S-178 madde 4; Mert 2026-10-20 ~00:40 AM PT): a row's section is one of its
-- location's sections, or a name typed in that lineup only ("Other…"), never both. Adds only.
alter table public.daily_lineup_rows add column section_name text;
alter table public.daily_lineup_rows
  add constraint daily_lineup_rows_section_name_check
    check (section_name is null or char_length(btrim(section_name)) between 1 and 40),
  add constraint daily_lineup_rows_one_section check (section_id is null or section_name is null);
