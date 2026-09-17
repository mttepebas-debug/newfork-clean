-- Optional US phone for a restaurant location, stored in E.164 (+1XXXXXXXXXX).
alter table public.locations add column phone text;
alter table public.locations add constraint locations_phone_format
  check (phone is null or phone ~ '^\+1[2-9][0-9]{9}$');
