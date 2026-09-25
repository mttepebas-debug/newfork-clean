# Local effective availability calendar evidence

The shared availability panel now displays a physical calendar calculated by the same approved capacity, shift-type restriction and effective time-off resolvers used by Schedule. This evidence covers local database/API/component behavior and the manager drawer in a real browser. It does not establish full employee/onboarding browser coverage or hosted readiness.

The existing synthetic `Availability UI QA` employee was used without changing availability, leave or assignments. Its previous cancellation case left approved leave at **09:00–11:30 and 13:00–17:00 on 2035-01-15 America/Los_Angeles**. In the manager's Employees → Availability drawer:

- The initial week correctly showed unconfirmed hours before the saved baseline's 2026-09-08 effective date, followed by available days.
- Selecting 2035-01-15 displayed the two approved leave intervals and three available intervals: midnight–09:00, 11:30–13:00 and 17:00–next midnight.
- Switching the display zone to UTC preserved physical instants and split the remaining leave across the appropriate UTC calendar dates. On January 15, leave appeared at 17:00–19:30 and 21:00–midnight; the remainder continued January 16.
- Changing the viewed date/zone created no availability draft. Navigation back to Profile required no discard prompt.

[Read-only database sample](calendar-read-sample.json) contains the first two days in both display zones, obtained with this employee's own identity through the same scoped SQL read service. No credentials or leave reasons are included.

| Viewport width | Drawer client/scroll width | Calendar client/scroll width | Result |
| --- | --- | --- | --- |
| 1280 px | 880/880 | 577/577 | No horizontal overflow |
| 390 px | 390/390 | 343/343 | Responsive employee section selector and readable intervals |
| 320 px | Not measured separately | 273/273 | Document 320/320; full-width date/time-zone controls; UTC selection completed |

The temporary viewport override was reset. The working verification tab was closed. The initial connection attempt had occurred while ports 5555/5556 had no listeners; process inspection confirmed only an unrelated 5561 preview, which was preserved. The local development runtime was started hidden and its listeners verified before browser work resumed. A browser-generated connection-error tab could not be acquired for explicit cleanup because its `data:` URL is blocked by the browser tool; it was left unmarked for normal end-of-turn cleanup.

The native browser date `fill` did not commit React state. Actual browser verification used the date control's month/day/year segments with keyboard input, then Show seven days. This confirmed the actual selected date rather than relying on its DOM value alone.

Validation: dated availability/calendar SQL 70/70 on main and clean isolated DBs before and after migration; lifecycle 79/79, read consistency 36/36 and publication lock 26/26 on the clean DB; execute privileges 3/3; security advisor no error-level issues; API routes 15/15; shared tests 35/35; web calendar/panel/queue/Hub 49/49; actual populated SQL DTO parse 1/1; shared/API/web typechecks. Further proposal before/after composition, larger histories/performance, broad role browser flows and full migration replay remain open.
