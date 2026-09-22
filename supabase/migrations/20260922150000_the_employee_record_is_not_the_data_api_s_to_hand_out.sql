-- Eight tables told signed-in callers they could read them and then could not
-- keep the promise: every one of their policies calls public.can_access_employee,
-- which that role cannot execute, so a direct read answered
--
--     ERROR: permission denied for function can_access_employee
--
-- rather than returning their rows. It failed closed, so nothing leaked. But a
-- grant that cannot work is worse than no grant: it says a door exists.
--
-- The grant is the part that is wrong, not the policy. This is an employee
-- record and everything hanging off it — who someone is, where and what they
-- work, what was done to their record, and how their employment ended. It
-- belongs to the people who run the workspace, and they reach it the way the
-- rest of the admin surface is reached: through a SECURITY DEFINER service
-- function that checks the permission first.
--
-- Checked before removing it, because a grant nobody uses and a grant somebody
-- depends on look identical from here:
--
--   * No app code selects any of these tables directly. The web reads fifteen
--     tables that way and none of them is one of these.
--   * No realtime subscription watches them. The two that exist watch
--     notification tables.
--   * No role an ordinary employee can hold carries the permission that opens
--     the screens built on them: employees.read, employees.manage,
--     employee_access.manage and employees.private.* are admin, manager and
--     owner only, and the route itself is gated on employees.read.
--   * anon never had a grant on any of them.
--
-- So nothing changes about who can see what. What changes is that the database
-- now says the same thing the API and the screens already said.

revoke select on
  public.employee_profiles,
  public.employee_invitations,
  public.employee_events,
  public.employee_job_assignments,
  public.employee_location_assignments,
  public.employee_terminations,
  public.employee_offboarding_followups,
  public.employee_offboarding_shift_actions
from authenticated;
