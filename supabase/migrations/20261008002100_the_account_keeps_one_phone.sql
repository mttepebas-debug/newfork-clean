-- BL-969: the account keeps one phone. The column kept for a backward-compatible
-- move is gone; 20261008002000 made it say what phone_e164 says. It goes on
-- its own, after the web that no longer reads it is live (live order: the
-- previous migration, main, Vercel live, a backup of the column, then this one).
--
-- The drop checks the copy rather than trusting it (coordinator, 2026-10-08):
-- no row may hold a different number in the old column than in phone_e164,
-- or nothing changes. After 20261008002000 the account's number is written to
-- phone_e164 alone (the new web, adopt_account_phone) and an old tab writes
-- the same number to both, so a difference means a number changed since, and
-- the drop waits for a look at the backup. Lock, check and drop are one
-- statement: the CLI runs a migration statement by statement, and no write may
-- land between the check and the drop.
do $drop$
declare
  differing integer;
begin
  perform set_config('lock_timeout', '5s', true);
  lock table public.user_profiles in access exclusive mode;

  select count(*) into differing
  from public.user_profiles
  where phone is distinct from phone_e164;

  if differing > 0 then
    raise exception 'BL-969 stopped before changing anything: % account(s) hold a different number in the old phone column than in phone_e164', differing;
  end if;

  alter table public.user_profiles drop column phone;
end
$drop$;

comment on column public.user_profiles.phone_e164 is
  'The account phone, a US number in E.164. The one phone: every live employee record copies it (KK-7).';
