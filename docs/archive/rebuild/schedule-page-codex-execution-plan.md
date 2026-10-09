# Schedule Page Codex Execution Plan

Source notes: `docs/archive/rebuild/schedule-page-feedback-notes.md`

Goal: fix and polish the `/app/schedule` experience without losing the existing dismissal priority rules. Old Newfork may be inspected read-only only when the current code does not reveal intended behavior.

## Coordination Rules

- Start every session by checking `git status --short --branch` and reading the source notes.
- Preserve unrelated WIP.
- Do not redesign the existing dismissal priority. Keep the current order used by `Escape` and empty-space dismissal.
- Verify with focused tests and at least one browser/manual smoke for the touched flow.
- Avoid running two sessions that edit the same core schedule files at the same time unless one is clearly finished and merged.

## Wave 1 - Core Interaction Correctness

Run these mostly sequentially because they likely touch `SchedulePage.tsx`, schedule target detection, and grid event handling.

### Session A - Dismissal Surface, Location Focus, Daily View

Prompt:

Fix schedule empty-space dismissal and header focus behavior in `/app/schedule`.

Requirements:

- Keep the existing dismissal priority order already implemented for `Escape`.
- Broaden "empty space" while schedule filters/focus/view layers are active: everything in the schedule content area counts except the left collapsible side menu and the top schedule action/filter buttons.
- The first click on this broad dismissal surface must clear only the next layer by the existing priority and must be consumed, so it must not reach the clicked cell, badge, card, or header underneath.
- Clicking a location header should focus that location.
- Clicking the already-focused location header again should be idempotent and should not toggle into an active/inactive loop.
- Clicking a date/day header opens daily view; broad empty-space dismissal should eventually return daily view to weekly view according to the existing priority.
- Add/update focused tests for location header idempotence, broad blank-surface click consumption, and daily-view dismissal.

Likely files:

- `apps/web/src/views/SchedulePage.tsx`
- `apps/web/src/schedule/lib/scheduleInteractionTargets.ts`
- `apps/web/src/schedule/lib/scheduleLocationFilterToggle.ts`
- Related schedule tests.

Parallel safety:

- Do not run this at the same time as Session B or C unless those sessions avoid `SchedulePage.tsx` and grid event plumbing.

### Session B - Unassigned Row and Shift Badge Operations

Prompt:

Fix schedule edit mode operational workflows: unassigned row visibility, multi-select, delete confirmation, copy/paste, paste mode, and drag-drop conflict validation.

Requirements:

- In schedule edit mode, the unassigned shift row must be visible when enabled.
- The Settings show/hide unassigned row control must actually toggle that row.
- `Ctrl` + click on a shift badge selects it.
- `Ctrl` or `Shift` + click on additional shift badges adds them to the selection.
- Pressing `Delete` with multiple selected shifts should open an app confirmation flow before deletion.
- `Ctrl+C` with selected shift badges copies the selected shift data.
- `Ctrl+V` turns paste mode on.
- In paste mode, clicking a schedule cell pastes the copied shift into that employee/date/location context.
- Paste and drag-drop must validate location assignment, job assignment, availability, and overlapping shifts in other locations before creating or moving shifts.
- Conflicts must block the operation and show clear validation feedback.
- Add focused tests for the state transitions and validation guards.

Likely files:

- Shift badge/grid row components.
- Schedule edit/session hooks.
- Conflict validation helpers.
- Settings toggle state.

Parallel safety:

- Can run parallel with UI-only Sessions D, E, or F if those do not touch shift operation logic.
- Avoid running in parallel with Session A if both need broad grid pointer/keyboard event handlers.

## Wave 2 - Top Bar and Edit Mode Shell

These are medium-risk layout/UI tasks. Run after Session A if it changes top-level schedule event handling.

### Session C - Top Actions, Export Placement, Edit Mode Status, Discard Confirmation

Prompt:

Repair schedule top actions and edit-mode shell behavior.

Requirements:

- In schedule edit mode entered through `New schedule` -> `New schedule (blank)`, keep `Export`, `New schedule`, `Templates`, and `Publish` visible and functional.
- Fix the top-right `Export` interaction. The export UI currently renders below the grid and is only visible after scrolling. Rework it so it opens in a visible, intentional position near the action area or as an app-native dialog/sheet.
- Replace native browser/OS discard confirmation with an app-native confirmation experience that matches the app theme. Keep the destructive confirmation behavior.
- Add an edit-mode status label in the same general area/style as the existing `View only` indicator, making it clear that the grid is editable.
- Add tests or browser smoke coverage for edit mode action visibility, export opening position, discard confirmation, and status label.

Likely files:

- Schedule top/action bar components.
- Export dialog/menu components.
- Edit mode banner/status components.
- Discard flow code.

Parallel safety:

- Can run parallel with Sessions D, E, or F if ownership is split by component.
- Should not run parallel with another session editing the same top action bar.

### Session D - Sticky Top Controls and Weekly Navigation Consolidation

Prompt:

Rework schedule page vertical layout to preserve top controls during scroll and reclaim vertical space.

Requirements:

- `Calendar`, `Settings`, `Hide`, and `All locations` controls must remain sticky/fixed in the viewport while scrolling down.
- Move `Weekly view` plus its previous/next arrows into the same top button row, immediately to the left of `Calendar`.
- Remove the now-empty row previously occupied by the weekly view navigation.
- Keep the schedule grid usable on desktop and mobile widths.
- Verify the sticky behavior with a browser smoke test at realistic scroll positions.

Likely files:

- `ScheduleTopBar` and schedule page layout CSS.
- Schedule page container/sticky CSS.

Parallel safety:

- Can run parallel with Session B or F.
- Coordinate with Session C if both edit the top bar.

## Wave 3 - Grid Visual Polish

These can be split across parallel sessions if each owns a narrow component/CSS area.

### Session E - Grid Header and Publish Status Polish

Prompt:

Polish schedule grid headers and per-location publish status.

Requirements:

- Center location header text within each location header area.
- In multi-location weekly grids, remove extra internal vertical divider lines from second and later location groups so they match the first group.
- Keep a thicker vertical separator only between location groups, after each location group's Sunday column and before the next location group's Monday column.
- Redesign day/date header cells so day name and date number feel cohesive, professional, enterprise-grade, and easy to scan.
- Add clear but restrained cursor, hover, focus, and transition affordances to clickable location headers and day/date headers.
- Remove the separate live/published button-indicator row above the schedule grid.
- Use the existing per-location Sunday/status area for publish state: green and more prominent for `Published`, normal/less prominent for non-published.
- Ensure publish state works independently per visible location.

Likely files:

- `ScheduleLocationHeader`
- `ScheduleGridHeaders`
- Grid layout/CSS.
- Publish status/header components.

Parallel safety:

- Can run parallel with Session B and F.
- Coordinate with Session A if both edit `ScheduleLocationHeader` click behavior.
- Coordinate with Session D if both edit grid/header sticky CSS.

### Session F - Badges, Employee Rows, Logo Slot, Add Shift Hover

Prompt:

Polish schedule grid row, badge, logo, and hover-action presentation.

Requirements:

- Remove employee codes from under employee names in schedule grid row labels.
- Fix shift badge text alignment so text does not sit behind or collide with the badge marker/circle.
- Improve badge typography for readability.
- Render shift times explicitly: 24-hour mode as `HH:MM - HH:MM`; 12-hour mode as `9:00 AM - 5:00 PM`; never abbreviate as `9A - 5P`.
- Move the hover `Add shift` button under existing shift badges when a cell already has shifts.
- Enlarge the top-left logo area upward into a larger/wider rectangular region so logo text/details are readable.
- Move `Editing draft` / `Unsaved changes` text to the right side of the logo boundary.
- Keep layout stable and avoid crowding neighboring headers.

Likely files:

- Schedule row/employee label components.
- Shift badge components.
- Cell hover action components.
- Logo frame/top-left grid slot components.
- Related CSS/tests.

Parallel safety:

- Good parallel candidate with Sessions B, C, or D if it avoids shared top bar files.
- Coordinate with Session E if both edit the same grid header CSS.

## Wave 4 - Add Shift Drawer Redesign

Run this after Session B if shift creation logic changes, because the drawer may depend on the same data model and validation path.

### Session G - Add Shift Drawer UI and Field Logic

Prompt:

Redesign and debug the Add Shift drawer opened from schedule edit mode.

Requirements:

- When clicking a schedule cell in edit mode, the right-side Add Shift drawer should look polished and consistent with the app.
- Anchor `Cancel` and `Add shift` in a clear footer/action area; they should not look like floating controls.
- Remove or give clear purpose to the large check mark currently sitting in the drawer.
- Fix overlapping text/fonts in `Start` and `End` inputs.
- If the clicked cell already determines employee, do not show employee as a required editable dropdown; either hide it or show it as read-only context.
- If the clicked cell already determines date, do not show date as a required editable field; either hide it or show it as read-only context.
- Keep useful fields: `Job`, `Shift type`, `Start`, `End`, and `Unpaid break`.
- Preserve validation and create-shift behavior.
- Add focused component tests and a browser smoke for opening the drawer from an employee/date cell.

Likely files:

- Add Shift drawer/quick editor components.
- Time input components if overlap is shared.
- Shift create/edit hooks.

Parallel safety:

- Best run after Session B.
- Can run parallel with Session E or D if no shared CSS file conflicts are likely.

## Suggested Parallel Execution

Batch 1:

- Session A alone first. It touches foundational click and dismissal behavior.

Batch 2:

- Session B and Session D can run together.
- Session C can also run if it is kept to export/edit-shell files and avoids topbar files being edited by Session D. If both need topbar, run C after D.

Batch 3:

- Session E and Session F can run together if file ownership is respected: E owns headers/publish status; F owns row labels, badges, logo, hover add shift.

Batch 4:

- Session G after Session B, because drawer behavior should align with fixed shift creation/validation logic.

Final integration:

- Rebase/merge one session at a time.
- Run lint/typecheck and focused schedule tests.
- Browser smoke `/app/schedule` for: view-only, edit mode, multi-location week, daily view dismissal, export, sticky top controls, add shift drawer, unassigned row, badge selection/copy/paste/delete.
