-- BL-969: the account keeps one phone. The column kept for a backward-compatible
-- move is gone; its US numbers were taken over by 20261008000000. It goes on
-- its own, after the web that no longer reads it is live (live order: the
-- previous migration, main, Vercel live, then this one).

set local lock_timeout = '5s';

alter table public.user_profiles drop column phone;

comment on column public.user_profiles.phone_e164 is
  'The account phone, a US number in E.164. The one phone: every live employee record copies it (KK-7).';
