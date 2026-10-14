---
name: availability-qa-logins-and-traps
description: Availability QA paths (AVAIL-002, EKRAN-04): accounts per role, team API path and error-mock shape, type-mode Meyhouse, phone Save swallowed
metadata:
  type: reference
---

Local world "e2e1791130198245" (2026-10-04), password `world-pass-2026` via /sign-in: employee Ali (`...ali.7b526937@world.test`), manager Ayse (`...ayse.a0bf9882`), owner (`...owner.dfb09487`, password login worked). Time_range mode.
- shift_type mode exists only in Meyhouse: `test.employee@meyhouse.test` via magic link (OTP + mailpit 55324 + `/sign-in#access_token=...` hash URL, reload; 60 s OTP cooldown).
- Onboarding in progress (read-only visit): `...ln2494t.bab1dc49@world.test` -> /workspaces "Continue" -> /welcome/<ws>/availability. Find others with `employee_onboarding_cases where status='in_progress'`.
- Employees drawer for Ali: sidebar buttons are inside `[role=dialog]`; on phone it is a `<select>`. "Employee availability" sub-tab is read-only; the editor (Add hours) is under "Manager reminders".
- Other sessions write to this world's availability while you QA (events by Ali/Ayse at unknown times); check `weekly_preference_events` before blaming your own clicks. Save with invalid hours is blocked client-side (no write).
- Phone (<=720px): while a field is focused the Employee Hub bottom nav is `display:none` (employee-dashboard.css `:has(input:focus)`), so the first tap on a sticky Save after typing is swallowed (Save moves 66px). Playwright: use `page.mouse.down()` then re-measure.
- "Discard ... changes?" dialog (availability-navigation.tsx) uses unstyled `<button>`s on every screen (Profile, Preferences, Time off, My availability); shared inconsistency, not per-ticket.

2026-10-06 (EKRAN-04 C, verified):
- `owner@newfork.test` signs in by password grant (`/auth/v1/token?grant_type=password`, seed password in `supabase/seed.sql`) then the `/sign-in#access_token=...` hash URL; its Meyhouse (`...de00fd`) has only 4 rows (good for "1 employees" / small-list states). The bigger Meyhouse (`...0fa1`) has no fixture single-location manager (only `mt.tepebas@gmail.com`, the user's own account - do not use); use world Ayse (`e2e1791130198245.ayse...`, 1 location, 30 rows) instead.
- Team list API: `GET :5639/v1/workspaces/<id>/availability/weekly/team`. Mock errors with the real shape `{error:"...", reason:"authz.*"}`; an `error` object renders "[object Object]" (mock artifact, not a bug); no `error` key shows the fallback "Availability could not be updated".
- Settings → Scheduling scrolls inside a container: `mouse.move` over content then `mouse.wheel`. ArrowRight on the Entry mode radio switches the mode locally (no write, but "Unsaved changes" appears).
