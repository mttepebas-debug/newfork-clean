---
name: employees-drawer-patterns
description: Employees drawer (EmployeeDrawer.tsx) after EMP-001 A/A2/A3, 2026-09-30 — the no-visible-help-text pattern, how rows are locked, what breaks when a note is removed, test and gate traps
metadata:
  type: reference
---

- No help text is printed under a field in the drawer (user decision 2026-09-30). A reason stays as `<span id className="sr-only">` + `aria-describedby` on the control + `title` on the wrapping label or button. `Field` takes `lockedReason` and `mark` (icon inside the input, `role="img"` with `aria-label`). Validation errors stay visible under the field. Test helper `described(el)` in the "EMP-001 look" block of `EmployeeDrawer.test.tsx` returns `{ text, hidden }`.
- Do not put `title` on a `role="img"` that already has `aria-label`: Chrome reports the title as a description and the name is read twice. Put the tooltip on the wrapper.
- Every read-only input is grey through one rule, `.employee-field input[readonly]`; `disabled` has its own. A white input that cannot be typed into is the bug to avoid once its note is gone.
- Removing a note moves its neighbours: something was making room for it. Met three times: `.employee-field` stretched its rows (inputs on one row sat 11px apart until `align-content: start`), an `::after { min-height }` under read-only fields, and `margin-bottom: 20px` on "Remove access". After deleting text, measure the row (input top/bottom) before and after.
- Jobs and Locations are one component, `AssignmentPicker`. Rows must stay direct children of the fieldset: CSS uses `.employee-assignment-picker > div` and tests find a row with `getByLabelText(name).closest("div")`. Group headings are siblings (`strong.employee-assignment-group`) tied to each checkbox by `aria-describedby`, not wrappers. A row is locked with `lockedIds` + `rowAction`.
- An admin does not get the Access tab on the owner's record, and the owner's own emergency fields draw only for the owner: those views need the owner signed in (or the detail read answered with `page.route`, said so in the report).
- The whole web vitest run with two dev servers up failed once on `PublicTrustPages` (5 s timeout under load, 0.7 s alone). Stop the preview servers before the full run.
- A task file's Done-when can contradict the coordinator's message (grep for a string → 0 vs "keep it for screen readers"). Follow the message, report the measured count and why.
- GateGuard asks for two facts before the first Bash after every incoming message and four before the first Edit/Write of each file (importers, affected API, data, the instruction quoted). The first touch of a file is refused once; state the facts and send the same call again. Later edits of that file in the same turn pass.
- Since EMP-001 C3: `AssignmentPicker` switches a row off for a reason — the Owner job always (`option.owner`), every row when `fixedReason` is passed (the owner's locations). Such a row is `disabled` + `data-locked="true"` ticked or not, has no Primary, and its reason is one `sr-only` span per picker added to the checkbox's `aria-describedby` after the group heading's id (two ids: split on space). `PassiveTerminate` takes `reason`; a draft holds Terminate through it.
- Reading vitest output through `grep` needs `NO_COLOR=1`, or the colour codes hide `×` lines.
- Never send a GateGuard-guarded Write in the same parallel batch as the command that reads its result: the Write is refused, the next call still runs on the old file. FB-6.3.6c's inbox got the previous task's report that way (2026-10-01). Write, see it succeed, then `inbox.mjs send`.
