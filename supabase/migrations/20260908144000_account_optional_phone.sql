alter table public.user_profiles
  add column if not exists phone text
  check (phone is null or char_length(btrim(phone)) between 7 and 30);
