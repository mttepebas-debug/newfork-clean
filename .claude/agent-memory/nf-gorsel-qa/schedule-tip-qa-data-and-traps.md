---
name: schedule-tip-qa-data-and-traps
description: Where Meyhouse has data for Schedule availability-tip QA (week 2026-09-21), how to inject manager_notes/time off/an "!" card via page.route, and two tooltip traps (focus-scroll closes the bubble; no max-height)
metadata:
  type: reference
---

Meyhouse week `/app/schedule?date=2026-09-21` (owner `owner@newfork.test`) has shifts and marks:
Jordan Lee Mon 9-5 is a manager-only interval in both Main Dining and Garden Room (employee_intervals empty); Alex Kim Tue-Fri are his own.
No time off and no "!" card on Jordan by default: inject in the `schedule/reference` route - `leave_intervals` on Sam, and push a copy of a 9/21 shift with a real uuid id, Jordan's employee_id and `warning_codes:["availability"]` (a non-uuid id silently breaks the grid). Select the card as `button[data-shift-id=...]` (a ghost `article` shares the id).
`manager_notes` is a 7-item array from Sunday (Mon = index 1); `null` = reader may not read it.

Traps seen 2026-10-01 (G14-note):
- `Tooltip` closes on any scroll; Tab to a cell that must scroll into view fires a scroll right after opening, so the bubble never shows for that cell (pre-existing, not a diff regression).
- The rich bubble has no max-height and no `overflow-wrap`; long user text runs off the top of the screen / past the border. Test text near the stored limit (manager note 1000 chars), not just a "long" sample.
- Owner in "Employee view" gets "You don't have access to Employee Hub" (owner is not an employee); employee-side checks need the employee login.

Related: [[meyhouse-role-logins-and-touch-test]], [[ghost-shift-mock-via-playwright-route]].
