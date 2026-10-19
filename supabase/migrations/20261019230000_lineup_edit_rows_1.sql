-- LINEUP-EDIT L2a, part 1 of 3: an edit is a lineup command too, so that one sent again under its id answers the same.
-- The kind check is dropped and made again with 'edit' (the one statement that drops anything, on its own).
alter table public.lineup_commands drop constraint lineup_commands_kind_check;
alter table public.lineup_commands
  add constraint lineup_commands_kind_check check (kind = any (array['share', 'unpublish', 'edit']));
