-- Hour ranges in announcement texts name AM/PM on both ends (Mert, 2026-10-12):
-- "4:00 PM–10:00 PM", "12:30 AM–8:00 AM" or "16:00–22:00". Was "4:00–10:00 PM" when both
-- ends fell in the same half of the day. Body only; owner and grants stay as they are.
create or replace function app_private.announcement_hours_text(starts time, ends time, fmt text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when fmt = '24h' then to_char(starts, 'HH24:MI') || '–' || to_char(ends, 'HH24:MI')
    else to_char(starts, 'FMHH12:MI AM') || '–' || to_char(ends, 'FMHH12:MI AM') end
$$;
